import type { DistrictId } from "./ilocos-sur-districts.ts";

export interface OutageMatchFields {
  outage_date: string;
  start_time: string;
  end_time?: string | null;
  outage_type?: string | null;
  district?: DistrictId | null;
  areas: string[];
  partial_areas?: string[];
  exclusions?: string[];
}

function normalizeTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function listSignature(items: string[] | null | undefined): string {
  return [...(items ?? [])].sort().join("|").toLowerCase();
}

function locationSignature(o: OutageMatchFields): string {
  return `${listSignature(o.areas)}::p:${listSignature(o.partial_areas)}::e:${listSignature(o.exclusions)}`;
}

/**
 * Returns true when a stored active outage row describes the same interruption
 * as a parsed cancellation (same date, time window, district, and locations).
 */
export function outageMatchesStored(
  stored: OutageMatchFields,
  parsed: OutageMatchFields,
): boolean {
  if (stored.outage_date !== parsed.outage_date) return false;
  if (normalizeTime(stored.start_time) !== normalizeTime(parsed.start_time)) {
    return false;
  }

  if ((stored.district ?? null) !== (parsed.district ?? null)) return false;
  if (locationSignature(stored) !== locationSignature(parsed)) return false;

  const storedType = stored.outage_type === "emergency" ? "emergency" : "scheduled";
  const parsedType = parsed.outage_type === "emergency" ? "emergency" : "scheduled";
  if (storedType !== parsedType) return false;

  const parsedEnd = normalizeTime(parsed.end_time);
  const storedEnd = normalizeTime(stored.end_time);
  if (parsedEnd && storedEnd && parsedEnd !== storedEnd) return false;

  return true;
}
