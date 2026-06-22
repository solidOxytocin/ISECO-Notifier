// ISECO operates in the Philippines (Asia/Manila, UTC+8, no DST), so a fixed
// +08:00 offset is safe and avoids timezone-database dependencies.
const MANILA_OFFSET = "+08:00";

export interface OutageTimeFields {
  outage_type?: string | null;
  outage_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time?: string | null; // HH:MM or null (emergency)
}

/**
 * Returns true when an outage is already over and should not be stored or
 * broadcast.
 *
 * - Scheduled (has end_time): passed once its end datetime (Manila) is before now.
 * - Emergency / no end_time: passed only once the whole outage day (Manila) is
 *   over, so an outage earlier today is still considered active.
 *
 * If the date/time can't be parsed, returns false (fail open — better to keep a
 * questionable outage than silently drop a real one).
 */
export function isOutagePassed(
  outage: OutageTimeFields,
  now: Date = new Date(),
): boolean {
  const hasEnd = outage.outage_type !== "emergency" &&
    outage.end_time != null &&
    outage.end_time !== "";

  if (hasEnd) {
    const endInstant = new Date(
      `${outage.outage_date}T${outage.end_time}:00${MANILA_OFFSET}`,
    );
    if (!Number.isNaN(endInstant.getTime())) {
      return endInstant.getTime() < now.getTime();
    }
  }

  // Emergency or unparseable end: passed only after the outage day ends.
  const endOfDay = new Date(`${outage.outage_date}T23:59:59${MANILA_OFFSET}`);
  if (Number.isNaN(endOfDay.getTime())) return false;
  return endOfDay.getTime() < now.getTime();
}
