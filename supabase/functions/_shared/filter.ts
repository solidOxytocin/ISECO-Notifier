export interface OutageForFilter {
  outage_date: string;
  start_time: string;
  end_time: string;
  areas: string[];
  exclusions?: string[];
  is_district_wide?: boolean;
}

/**
 * Returns true if user has no barangays (notify all) or outage affects a watched area.
 */
export function shouldNotifyUser(
  outage: OutageForFilter,
  userBarangays: string[],
): boolean {
  if (!userBarangays || userBarangays.length === 0) return true;

  const normalizedUser = userBarangays.map((b) => b.toLowerCase().trim());
  const allAreas = (outage.areas ?? []).map((a) => a.toLowerCase());
  const exclusions = (outage.exclusions ?? []).map((e) => e.toLowerCase());

  if (outage.is_district_wide) {
    const excluded = normalizedUser.some((b) =>
      exclusions.some((ex) => ex.includes(b) || b.includes(ex))
    );
    if (excluded) return false;
    return normalizedUser.length > 0;
  }

  return normalizedUser.some((barangay) =>
    allAreas.some(
      (area) => area.includes(barangay) || barangay.includes(area.split(",")[0].trim()),
    ),
  );
}
