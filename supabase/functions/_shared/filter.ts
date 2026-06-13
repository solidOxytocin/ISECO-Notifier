import {
  getAffectedLocations,
  locationsMatch,
} from "./normalize.ts";
import type { DistrictId } from "./ilocos-sur-districts.ts";

export interface OutageForFilter {
  outage_date: string;
  start_time: string;
  end_time: string;
  district?: DistrictId | null;
  areas: string[];
  partial_areas?: string[];
  exclusions?: string[];
}

export { getAffectedLocations };

/**
 * Returns true if user has no barangays (notify all) or outage affects a watched area.
 */
export function shouldNotifyUser(
  outage: OutageForFilter,
  userBarangays: string[],
): boolean {
  if (!userBarangays || userBarangays.length === 0) return true;

  const affected = getAffectedLocations({
    district: outage.district,
    areas: outage.areas ?? [],
    partial_areas: outage.partial_areas ?? [],
    exclusions: outage.exclusions ?? [],
  });

  return userBarangays.some((userLoc) => {
    if ((outage.exclusions ?? []).some((ex) => locationsMatch(ex, userLoc))) {
      return false;
    }
    return affected.some((a) => locationsMatch(a, userLoc));
  });
}
