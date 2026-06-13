import {
  DISTRICT_MUNICIPALITIES,
  parseDistrictFromText,
} from './ilocos-sur-districts.js';

const ALL_MUNICIPALITIES = [
  ...DISTRICT_MUNICIPALITIES['1st'],
  ...DISTRICT_MUNICIPALITIES['2nd'],
];

function cleanExclusionText(ex) {
  return ex
    .replace(/\)\s*,/g, ',')
    .replace(/\)+$/g, '')
    .trim();
}

function normalizeLocation(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** True if two location strings refer to the same place. */
export function locationsMatch(a, b) {
  const na = normalizeLocation(a);
  const nb = normalizeLocation(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function municipalityIsExcluded(municipality, exclusions) {
  const muniNorm = normalizeLocation(municipality);
  return exclusions.some((ex) => {
    const exNorm = normalizeLocation(ex);
    if (exNorm.includes(muniNorm) || muniNorm.includes(exNorm)) return true;
    const parts = ex.split(',');
    if (parts.length > 1) {
      const muniPart = normalizeLocation(parts[parts.length - 1]);
      return muniNorm.includes(muniPart) || muniPart.includes(muniNorm);
    }
    return false;
  });
}

/** All affected municipalities/barangays (district expanded + full + partial areas). */
export function getAffectedLocations(outage) {
  const locations = new Set();
  const { district, areas = [], partial_areas = [], exclusions = [] } = outage;

  if (district === '1st' || district === '2nd') {
    for (const muni of DISTRICT_MUNICIPALITIES[district]) {
      if (!municipalityIsExcluded(muni, exclusions)) {
        locations.add(muni);
      }
    }
  }

  for (const area of [...areas, ...partial_areas]) {
    if (!/whole.*district/i.test(area)) {
      locations.add(area);
    }
  }

  return [...locations];
}

/** Pull exclusions from district EXCEPT or inline (except X). */
export function extractExclusionsFromRaw(areasRaw) {
  const exclusions = [];
  for (const line of areasRaw) {
    // Inline: "(except Puerto), Sto. Domingo"
    for (const m of line.matchAll(/\(except\s+([^)]+)\)/gi)) {
      exclusions.push(m[1].trim());
    }

    // District-wide: "Whole 1st District EXCEPT Puro, Caoayan" — not inline (except
    if (!/\(except\s+/i.test(line)) {
      const exceptEnd = line.match(/\bEXCEPT\s+(.+)$/i);
      if (exceptEnd) exclusions.push(exceptEnd[1].trim());
    }
  }
  return exclusions;
}

/**
 * Map bare barangay exclusions → "Barangay, Municipality" using areas_raw context.
 * e.g. "Puerto" + "...(except Puerto), Sto. Domingo" → "Puerto, Sto. Domingo"
 */
export function qualifyExclusions(exclusions, areasRaw, areas = []) {
  const muniForExclusion = new Map();

  for (const line of areasRaw) {
    const inline = line.match(/\(except\s+([^)]+)\)\s*,\s*(.+)$/i);
    if (inline) {
      muniForExclusion.set(normalizeLocation(inline[1]), inline[2].trim());
    }

    const wholeMuni = parseWholeMunicipality(line);
    if (wholeMuni) {
      const exceptEnd = line.match(/\bEXCEPT\s+(.+)$/i);
      if (exceptEnd) {
        const exText = exceptEnd[1].trim();
        if (!exText.includes(',')) {
          muniForExclusion.set(normalizeLocation(exText), wholeMuni);
        }
      }
    }
  }

  for (const area of areas) {
    const comma = area.lastIndexOf(',');
    if (comma === -1) continue;
    const muni = area.slice(comma + 1).trim();
    for (const line of areasRaw) {
      if (!line.toLowerCase().includes(muni.toLowerCase())) continue;
      for (const m of line.matchAll(/\(except\s+([^)]+)\)/gi)) {
        muniForExclusion.set(normalizeLocation(m[1]), muni);
      }
    }
  }

  return exclusions.map((ex) => {
    const cleaned = cleanExclusionText(ex);
    if (cleaned.includes(',')) return cleaned;
    const muni = muniForExclusion.get(normalizeLocation(cleaned));
    return muni ? `${cleaned}, ${muni}` : cleaned;
  });
}

/** Remove duplicate and malformed exclusions. */
export function dedupeExclusions(exclusions) {
  const result = [];
  for (const ex of exclusions) {
    const cleaned = cleanExclusionText(ex);
    if (!cleaned) continue;
    if (!result.some((e) => locationsMatch(e, cleaned))) {
      result.push(cleaned);
    }
  }
  return result;
}

/** True if area should be dropped because it duplicates an exclusion. */
function areaMatchesExclusion(area, ex) {
  if (!locationsMatch(area, ex)) return false;
  // Keep municipality-wide area when exclusion is a barangay within it
  const areaIsMuniOnly = !area.includes(',');
  const exHasBarangay = ex.includes(',');
  if (areaIsMuniOnly && exHasBarangay) {
    const exMuni = ex.slice(ex.lastIndexOf(',') + 1).trim();
    if (locationsMatch(area, exMuni)) return false;
  }
  return true;
}

/** "Barangays of VIGAN CITY" → "Vigan City" (header, not an affected area). */
export function parseMunicipalityHeader(line) {
  const match = line.trim().match(/^Barangays?\s+of\s+(.+)$/i);
  if (!match) return null;
  return formatMunicipalityName(match[1]);
}

export function isMunicipalityHeader(line) {
  return /^Barangays?\s+of\s+/i.test(line.trim());
}

/** "Whole Area of Vigan" / "Whole Area of Vigan EXCEPT Baluarte" → "Vigan City". */
export function parseWholeMunicipality(line) {
  const trimmed = line.trim();
  if (/whole.*district/i.test(trimmed)) return null;

  const match = trimmed.match(/^Whole\s+Area\s+of\s+(.+)$/i);
  if (!match) return null;

  const name = match[1].replace(/\s+\bEXCEPT\s+.+$/i, '').trim();
  return name ? resolveMunicipalityName(name) : null;
}

export function isWholeMunicipalityLine(line) {
  return parseWholeMunicipality(line) !== null;
}

function formatMunicipalityName(raw) {
  const expansions = {
    sto: 'Santo',
    'sto.': 'Santo',
    sta: 'Santa',
    'sta.': 'Santa',
  };
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (expansions[lower]) return expansions[lower];
      if (lower === 'city') return 'City';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Map poster municipality text to canonical name (e.g. "Vigan" → "Vigan City"). */
function resolveMunicipalityName(raw) {
  const formatted = formatMunicipalityName(raw);
  const norm = normalizeLocation(formatted);

  for (const muni of ALL_MUNICIPALITIES) {
    if (normalizeLocation(muni) === norm) return muni;
  }

  for (const muni of ALL_MUNICIPALITIES) {
    const mNorm = normalizeLocation(muni);
    const withoutCity = mNorm.replace(/ city$/, '');
    if (norm === withoutCity || (norm.length >= 3 && mNorm.startsWith(norm))) {
      return muni;
    }
  }

  return formatted;
}

function isKnownMunicipality(name) {
  const resolved = resolveMunicipalityName(name);
  return ALL_MUNICIPALITIES.some(
    (m) => normalizeLocation(m) === normalizeLocation(resolved),
  );
}

/** Split on commas but keep text inside parentheses together. */
export function splitCommaSeparatedAreas(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

/** "Patpata 1st & 2nd" → ["Patpata 1st", "Patpata 2nd"]. */
export function expandAmpersandRanges(name) {
  const match = name.match(/^(.+?)\s+(1st|2nd|first|second)\s*&\s*(1st|2nd|first|second)$/i);
  if (match) {
    const base = match[1].trim();
    return [`${base} 1st`, `${base} 2nd`];
  }
  return [name];
}

/** "Some parts of: San Jose, …" → { isPartial, content }. */
export function parsePartialAreasContent(line) {
  const match = line.trim().match(/^Some\s+parts\s+of\s*:?\s*(.*)$/i);
  if (!match) return { isPartial: false, content: null };
  const content = match[1].replace(/\.$/, '').trim();
  return { isPartial: true, content: content || null };
}

function qualifyPlaceList(rawNames, defaultMuni) {
  let names = rawNames
    .flatMap(expandAmpersandRanges)
    .map((n) => n.trim())
    .filter(Boolean);
  let muni = defaultMuni;

  if (names.length > 0) {
    const last = names[names.length - 1];
    if (isKnownMunicipality(last)) {
      muni = resolveMunicipalityName(last);
      names = names.slice(0, -1);
    }
  }

  return names
    .map((n) => {
      const cleaned = n.replace(/\s*\(except\s+[^)]+\)/gi, '').trim();
      if (!cleaned) return null;
      if (cleaned.includes(',')) return cleaned;
      return muni ? `${cleaned}, ${muni}` : cleaned;
    })
    .filter(Boolean);
}

function isCommaSeparatedPlaceList(text) {
  const parts = splitCommaSeparatedAreas(text);
  if (parts.length <= 1) return false;
  const last = parts[parts.length - 1];
  if (isKnownMunicipality(last)) {
    if (parts.length === 2 && /\bto\b/i.test(parts[0])) return false;
    return true;
  }
  return parts.length >= 3;
}

function inferMunicipalityFromRaw(areasRaw) {
  for (const line of areasRaw) {
    const header = parseMunicipalityHeader(line);
    if (header) return header;
    const whole = parseWholeMunicipality(line);
    if (whole) return whole;
    const partial = parsePartialAreasContent(line);
    const text = partial.isPartial ? partial.content : line;
    if (!text) continue;
    if (partial.isPartial || isCommaSeparatedPlaceList(text)) {
      const parts = splitCommaSeparatedAreas(text);
      const last = parts[parts.length - 1];
      if (last && isKnownMunicipality(last)) {
        return resolveMunicipalityName(last);
      }
    }
  }
  return null;
}

/**
 * Process areas_raw into full and partial coverage lists.
 * sharedMunicipality propagates across outages on the same poster image.
 */
export function processAreasFromRaw(areasRaw, sharedMunicipality = null) {
  const areas = [];
  const partial_areas = [];
  let currentMuni = sharedMunicipality ?? inferMunicipalityFromRaw(areasRaw);
  let inPartialMode = false;

  for (const line of areasRaw) {
    const headerMuni = parseMunicipalityHeader(line);
    if (headerMuni) {
      currentMuni = headerMuni;
      inPartialMode = false;
      continue;
    }

    if (/whole.*district/i.test(line)) {
      inPartialMode = false;
      continue;
    }

    const wholeMuni = parseWholeMunicipality(line);
    if (wholeMuni) {
      areas.push(wholeMuni);
      currentMuni = wholeMuni;
      inPartialMode = false;
      continue;
    }

    const partial = parsePartialAreasContent(line);
    if (partial.isPartial) {
      inPartialMode = true;
      if (partial.content) {
        const places = qualifyPlaceList(
          splitCommaSeparatedAreas(partial.content),
          currentMuni,
        );
        partial_areas.push(...places);
        const last = places[places.length - 1];
        if (last?.includes(',')) {
          currentMuni = last.slice(last.lastIndexOf(',') + 1).trim();
        }
      }
      continue;
    }

    if (inPartialMode) {
      const places = qualifyPlaceList(splitCommaSeparatedAreas(line), currentMuni);
      partial_areas.push(...places);
      inPartialMode = false;
      continue;
    }

    const inline = line.match(/^(.+?)\s*\(except\s+[^)]+\)\s*,\s*(.+)$/i);
    if (inline) {
      const muni = formatMunicipalityName(inline[2]);
      areas.push(`${inline[1].trim()}, ${muni}`);
      currentMuni = muni;
      continue;
    }

    let area = line.replace(/\s*\(except\s+[^)]+\)/gi, '').trim();
    if (!area || isMunicipalityHeader(area)) continue;

    if (isCommaSeparatedPlaceList(area)) {
      const places = qualifyPlaceList(splitCommaSeparatedAreas(area), currentMuni);
      areas.push(...places);
      const last = places[places.length - 1];
      if (last?.includes(',')) {
        currentMuni = last.slice(last.lastIndexOf(',') + 1).trim();
      }
      continue;
    }

    if (!area.includes(',') && currentMuni) {
      area = `${area}, ${currentMuni}`;
    }
    areas.push(area);
  }

  return { areas, partial_areas };
}

/**
 * Process areas_raw: skip municipality headers, qualify bare barangays.
 * sharedMunicipality propagates across outages on the same poster image.
 */
export function applyMunicipalityToAreas(areasRaw, sharedMunicipality = null) {
  return processAreasFromRaw(areasRaw, sharedMunicipality).areas;
}

export function extractSharedMunicipality(outages) {
  for (const o of outages) {
    for (const line of o.areas_raw ?? o.areas ?? []) {
      const m = parseMunicipalityHeader(line);
      if (m) return m;
      const whole = parseWholeMunicipality(line);
      if (whole) return whole;
      const partial = parsePartialAreasContent(line);
      if (partial.isPartial && partial.content) {
        const parts = splitCommaSeparatedAreas(partial.content);
        const last = parts[parts.length - 1];
        if (last && isKnownMunicipality(last)) {
          return resolveMunicipalityName(last);
        }
      }
    }
  }
  return null;
}

/** Strip inline (except …) and ensure municipality suffix on area lines. */
export function normalizeAreasFromRaw(areasRaw, sharedMunicipality = null) {
  return processAreasFromRaw(areasRaw, sharedMunicipality);
}

function filterAreaList(areas, exclusions) {
  return areas.filter((area) => {
    if (/whole.*district/i.test(area)) return false;
    if (isWholeMunicipalityLine(area)) return false;
    if (isMunicipalityHeader(area)) return false;
    if (/^some\s+parts\s+of/i.test(area)) return false;
    if (exclusions.some((ex) => areaMatchesExclusion(area, ex))) return false;
    return true;
  });
}

/**
 * Normalize parsed outage:
 * - district: "1st" | "2nd" | null (replaces is_district_wide)
 * - areas: full-coverage locations
 * - partial_areas: "Some parts of" locations only
 * - exclusions: EXCEPT locations only
 */
export function normalizeOutage(outage, sharedMunicipality = null) {
  const o = { ...outage };
  o.areas = [...(o.areas ?? [])];
  o.areas_raw = [...(o.areas_raw ?? o.areas)];
  o.partial_areas = [...(o.partial_areas ?? [])];
  o.exclusions = [...(o.exclusions ?? [])];

  // Detect district from raw lines or legacy is_district_wide + areas text
  let district = o.district ?? null;
  if (!district) {
    for (const line of o.areas_raw) {
      district = parseDistrictFromText(line);
      if (district) break;
    }
  }
  if (!district && o.is_district_wide) {
    district = parseDistrictFromText(o.areas.join(' ')) ?? '1st';
  }
  o.district = district;

  const fromRaw = extractExclusionsFromRaw(o.areas_raw);
  let exclusions = o.exclusions.map(cleanExclusionText);
  for (const ex of fromRaw) {
    if (!exclusions.some((e) => locationsMatch(e, ex))) exclusions.push(ex);
  }
  exclusions = qualifyExclusions(exclusions, o.areas_raw, o.areas);
  o.exclusions = dedupeExclusions(exclusions);

  const processed = processAreasFromRaw(o.areas_raw, sharedMunicipality);
  if (processed.areas.length > 0 && !o.district) {
    o.areas = processed.areas;
  }
  for (const p of processed.partial_areas) {
    if (!o.partial_areas.some((x) => locationsMatch(x, p))) {
      o.partial_areas.push(p);
    }
  }

  o.areas = o.areas.filter(
    (a) => !o.partial_areas.some((p) => locationsMatch(a, p)),
  );
  o.areas = filterAreaList(o.areas, o.exclusions);
  o.partial_areas = filterAreaList(o.partial_areas, o.exclusions);

  delete o.is_district_wide;
  return o;
}

export function normalizeOutages(data) {
  if (!data?.outages || !Array.isArray(data.outages)) return data;
  const sharedMuni = extractSharedMunicipality(data.outages);
  return { outages: data.outages.map((o) => normalizeOutage(o, sharedMuni)) };
}
