import {
  DISTRICT_MUNICIPALITIES,
  type DistrictId,
  parseDistrictFromText,
} from "./ilocos-sur-districts.ts";
import type { ParsedOutage } from "./parser.ts";

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
  exclusions?: string[];
}): string[] {
  const locations = new Set<string>();
  const { district, areas = [], exclusions = [] } = outage;

  if (district === "1st" || district === "2nd") {
    for (const muni of DISTRICT_MUNICIPALITIES[district]) {
      if (!municipalityIsExcluded(muni, exclusions)) {
        locations.add(muni);
      }
    }
  }

  for (const area of areas) {
    if (!/whole.*district/i.test(area)) locations.add(area);
  }

  return [...locations];
}

export function extractExclusionsFromRaw(areasRaw: string[]): string[] {
  const exclusions: string[] = [];
  for (const line of areasRaw) {
    const match = line.match(/\bEXCEPT\s+(.+)$/i);
    if (match) exclusions.push(match[1].trim());
  }
  return exclusions;
}

export function normalizeOutage(
  outage: ParsedOutage & { is_district_wide?: boolean },
): ParsedOutage {
  const o = { ...outage };
  o.areas = [...(o.areas ?? [])];
  o.areas_raw = [...(o.areas_raw ?? o.areas)];
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
  const exclusions = [...o.exclusions];
  for (const ex of fromRaw) {
    if (!exclusions.some((e) => locationsMatch(e, ex))) exclusions.push(ex);
  }
  o.exclusions = exclusions;

  o.areas = o.areas.filter((area) => {
    if (/whole.*district/i.test(area)) return false;
    if (exclusions.some((ex) => locationsMatch(area, ex))) return false;
    return true;
  });

  return o;
}

export function normalizeOutages(data: { outages: ParsedOutage[] }) {
  return { outages: data.outages.map(normalizeOutage) };
}
