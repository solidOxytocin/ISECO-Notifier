import {
  DISTRICT_MUNICIPALITIES,
  parseDistrictFromText,
} from './ilocos-sur-districts.js';

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

/** All affected municipalities/barangays (district expanded + specific areas). */
export function getAffectedLocations(outage) {
  const locations = new Set();
  const { district, areas = [], exclusions = [] } = outage;

  if (district === '1st' || district === '2nd') {
    for (const muni of DISTRICT_MUNICIPALITIES[district]) {
      if (!municipalityIsExcluded(muni, exclusions)) {
        locations.add(muni);
      }
    }
  }

  for (const area of areas) {
    if (!/whole.*district/i.test(area)) {
      locations.add(area);
    }
  }

  return [...locations];
}

/** Pull exclusion list from "Whole 1st District EXCEPT Puro, Caoayan" lines in areas_raw. */
export function extractExclusionsFromRaw(areasRaw) {
  const exclusions = [];
  for (const line of areasRaw) {
    const match = line.match(/\bEXCEPT\s+(.+)$/i);
    if (match) exclusions.push(match[1].trim());
  }
  return exclusions;
}

/**
 * Normalize parsed outage:
 * - district: "1st" | "2nd" | null (replaces is_district_wide)
 * - areas: only specific locations beyond district scope
 * - exclusions: EXCEPT locations only
 */
export function normalizeOutage(outage) {
  const o = { ...outage };
  o.areas = [...(o.areas ?? [])];
  o.areas_raw = [...(o.areas_raw ?? o.areas)];
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
  const exclusions = [...o.exclusions];
  for (const ex of fromRaw) {
    if (!exclusions.some((e) => locationsMatch(e, ex))) exclusions.push(ex);
  }
  o.exclusions = exclusions;

  // areas = specific locations only (not district label, not exclusions)
  o.areas = o.areas.filter((area) => {
    if (/whole.*district/i.test(area)) return false;
    if (exclusions.some((ex) => locationsMatch(area, ex))) return false;
    return true;
  });

  delete o.is_district_wide;
  return o;
}

export function normalizeOutages(data) {
  if (!data?.outages || !Array.isArray(data.outages)) return data;
  return { outages: data.outages.map(normalizeOutage) };
}
