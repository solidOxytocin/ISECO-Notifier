import {
  DISTRICT_MUNICIPALITIES,
  type DistrictId,
  parseDistrictFromText,
} from "./ilocos-sur-districts.ts";
import type { ParsedOutage } from "./parser.ts";

const ALL_MUNICIPALITIES = [
  ...DISTRICT_MUNICIPALITIES["1st"],
  ...DISTRICT_MUNICIPALITIES["2nd"],
];

function cleanExclusionText(ex: string): string {
  return ex
    .replace(/\)\s*,/g, ",")
    .replace(/\)+$/g, "")
    .trim();
}

function normalizeLocation(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function locationsMatch(a: string, b: string): boolean {
  const na = normalizeLocation(a);
  const nb = normalizeLocation(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function municipalityIsExcluded(
  municipality: string,
  exclusions: string[],
): boolean {
  const muniNorm = normalizeLocation(municipality);
  return exclusions.some((ex) => {
    const exNorm = normalizeLocation(ex);
    if (exNorm.includes(muniNorm) || muniNorm.includes(exNorm)) return true;
    const parts = ex.split(",");
    if (parts.length > 1) {
      const muniPart = normalizeLocation(parts[parts.length - 1]);
      return muniNorm.includes(muniPart) || muniPart.includes(muniNorm);
    }
    return false;
  });
}

export function getAffectedLocations(outage: {
  district?: DistrictId | null;
  areas?: string[];
  partial_areas?: string[];
  exclusions?: string[];
}): string[] {
  const locations = new Set<string>();
  const { district, areas = [], partial_areas = [], exclusions = [] } = outage;

  if (district === "1st" || district === "2nd") {
    for (const muni of DISTRICT_MUNICIPALITIES[district]) {
      if (!municipalityIsExcluded(muni, exclusions)) {
        locations.add(muni);
      }
    }
  }

  for (const area of [...areas, ...partial_areas]) {
    if (!/whole.*district/i.test(area)) locations.add(area);
  }

  return [...locations];
}

export function extractExclusionsFromRaw(areasRaw: string[]): string[] {
  const exclusions: string[] = [];
  for (const line of areasRaw) {
    for (const m of line.matchAll(/\(except\s+([^)]+)\)/gi)) {
      exclusions.push(m[1].trim());
    }

    if (!/\(except\s+/i.test(line)) {
      const exceptEnd = line.match(/\bEXCEPT\s+(.+)$/i);
      if (exceptEnd) exclusions.push(exceptEnd[1].trim());
    }
  }
  return exclusions;
}

export function qualifyExclusions(
  exclusions: string[],
  areasRaw: string[],
  areas: string[] = [],
): string[] {
  const muniForExclusion = new Map<string, string>();

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
        if (!exText.includes(",")) {
          muniForExclusion.set(normalizeLocation(exText), wholeMuni);
        }
      }
    }
  }

  for (const area of areas) {
    const comma = area.lastIndexOf(",");
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
    if (cleaned.includes(",")) return cleaned;
    const muni = muniForExclusion.get(normalizeLocation(cleaned));
    return muni ? `${cleaned}, ${muni}` : cleaned;
  });
}

export function dedupeExclusions(exclusions: string[]): string[] {
  const result: string[] = [];
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
function areaMatchesExclusion(area: string, ex: string): boolean {
  if (!locationsMatch(area, ex)) return false;
  const areaIsMuniOnly = !area.includes(",");
  const exHasBarangay = ex.includes(",");
  if (areaIsMuniOnly && exHasBarangay) {
    const exMuni = ex.slice(ex.lastIndexOf(",") + 1).trim();
    if (locationsMatch(area, exMuni)) return false;
  }
  return true;
}

export function parseMunicipalityHeader(line: string): string | null {
  const match = line.trim().match(/^Barangays?\s+of\s+(.+)$/i);
  if (!match) return null;
  return formatMunicipalityName(match[1]);
}

export function isMunicipalityHeader(line: string): boolean {
  return /^Barangays?\s+of\s+/i.test(line.trim());
}

export function parseWholeMunicipality(line: string): string | null {
  const trimmed = line.trim();
  if (/whole.*district/i.test(trimmed)) return null;

  const match = trimmed.match(/^Whole\s+Area\s+of\s+(.+)$/i);
  if (!match) return null;

  const name = match[1].replace(/\s+\bEXCEPT\s+.+$/i, "").trim();
  return name ? resolveMunicipalityName(name) : null;
}

export function isWholeMunicipalityLine(line: string): boolean {
  return parseWholeMunicipality(line) !== null;
}

function formatMunicipalityName(raw: string): string {
  const expansions: Record<string, string> = {
    sto: "Santo",
    "sto.": "Santo",
    sta: "Santa",
    "sta.": "Santa",
  };
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (expansions[lower]) return expansions[lower];
      if (lower === "city") return "City";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function resolveMunicipalityName(raw: string): string {
  const formatted = formatMunicipalityName(raw);
  const norm = normalizeLocation(formatted);

  for (const muni of ALL_MUNICIPALITIES) {
    if (normalizeLocation(muni) === norm) return muni;
  }

  for (const muni of ALL_MUNICIPALITIES) {
    const mNorm = normalizeLocation(muni);
    const withoutCity = mNorm.replace(/ city$/, "");
    if (norm === withoutCity || (norm.length >= 3 && mNorm.startsWith(norm))) {
      return muni;
    }
  }

  return formatted;
}

function isKnownMunicipality(name: string): boolean {
  const resolved = resolveMunicipalityName(name);
  return ALL_MUNICIPALITIES.some(
    (m) => normalizeLocation(m) === normalizeLocation(resolved),
  );
}

export function splitCommaSeparatedAreas(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

export function expandAmpersandRanges(name: string): string[] {
  const match = name.match(/^(.+?)\s+(1st|2nd|first|second)\s*&\s*(1st|2nd|first|second)$/i);
  if (match) {
    const base = match[1].trim();
    return [`${base} 1st`, `${base} 2nd`];
  }
  return [name];
}

export function parsePartialAreasContent(line: string): {
  isPartial: boolean;
  content: string | null;
} {
  const match = line.trim().match(/^Some\s+parts\s+of\s*:?\s*(.*)$/i);
  if (!match) return { isPartial: false, content: null };
  const content = match[1].replace(/\.$/, "").trim();
  return { isPartial: true, content: content || null };
}

function qualifyPlaceList(
  rawNames: string[],
  defaultMuni: string | null,
): string[] {
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
      const cleaned = n.replace(/\s*\(except\s+[^)]+\)/gi, "").trim();
      if (!cleaned) return null;
      if (cleaned.includes(",")) return cleaned;
      return muni ? `${cleaned}, ${muni}` : cleaned;
    })
    .filter((n): n is string => Boolean(n));
}

function isCommaSeparatedPlaceList(text: string): boolean {
  const parts = splitCommaSeparatedAreas(text);
  if (parts.length <= 1) return false;
  const last = parts[parts.length - 1];
  if (isKnownMunicipality(last)) {
    if (parts.length === 2 && /\bto\b/i.test(parts[0])) return false;
    return true;
  }
  return parts.length >= 3;
}

function inferMunicipalityFromRaw(areasRaw: string[]): string | null {
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

export function processAreasFromRaw(
  areasRaw: string[],
  sharedMunicipality: string | null = null,
): { areas: string[]; partial_areas: string[] } {
  const areas: string[] = [];
  const partial_areas: string[] = [];
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
        if (last?.includes(",")) {
          currentMuni = last.slice(last.lastIndexOf(",") + 1).trim();
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

    let area = line.replace(/\s*\(except\s+[^)]+\)/gi, "").trim();
    if (!area || isMunicipalityHeader(area)) continue;

    if (isCommaSeparatedPlaceList(area)) {
      const places = qualifyPlaceList(splitCommaSeparatedAreas(area), currentMuni);
      areas.push(...places);
      const last = places[places.length - 1];
      if (last?.includes(",")) {
        currentMuni = last.slice(last.lastIndexOf(",") + 1).trim();
      }
      continue;
    }

    if (!area.includes(",") && currentMuni) {
      area = `${area}, ${currentMuni}`;
    }
    areas.push(area);
  }

  return { areas, partial_areas };
}

export function applyMunicipalityToAreas(
  areasRaw: string[],
  sharedMunicipality: string | null = null,
): string[] {
  return processAreasFromRaw(areasRaw, sharedMunicipality).areas;
}

export function extractSharedMunicipality(
  outages: { areas_raw?: string[]; areas?: string[] }[],
): string | null {
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

export function normalizeAreasFromRaw(
  areasRaw: string[],
  sharedMunicipality: string | null = null,
): { areas: string[]; partial_areas: string[] } {
  return processAreasFromRaw(areasRaw, sharedMunicipality);
}

function filterAreaList(areas: string[], exclusions: string[]): string[] {
  return areas.filter((area) => {
    if (/whole.*district/i.test(area)) return false;
    if (isWholeMunicipalityLine(area)) return false;
    if (isMunicipalityHeader(area)) return false;
    if (/^some\s+parts\s+of/i.test(area)) return false;
    if (exclusions.some((ex) => areaMatchesExclusion(area, ex))) return false;
    return true;
  });
}

export function normalizeOutage(
  outage: ParsedOutage & { is_district_wide?: boolean },
  sharedMunicipality: string | null = null,
): ParsedOutage {
  const o = { ...outage };
  o.areas = [...(o.areas ?? [])];
  o.areas_raw = [...(o.areas_raw ?? o.areas)];
  o.partial_areas = [...(o.partial_areas ?? [])];
  o.exclusions = [...(o.exclusions ?? [])];

  let district: DistrictId | null = o.district ?? null;
  if (!district) {
    for (const line of o.areas_raw) {
      district = parseDistrictFromText(line);
      if (district) break;
    }
  }
  if (!district && o.is_district_wide) {
    district = parseDistrictFromText(o.areas.join(" ")) ?? "1st";
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

  return o;
}

export function normalizeOutages(data: { outages: ParsedOutage[] }) {
  const sharedMuni = extractSharedMunicipality(data.outages);
  return { outages: data.outages.map((o) => normalizeOutage(o, sharedMuni)) };
}
