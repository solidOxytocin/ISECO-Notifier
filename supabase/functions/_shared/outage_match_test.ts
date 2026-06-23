import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { outageMatchesStored } from "./outage_match.ts";

Deno.test("matches whole 1st district EXCEPT cancellation to stored row", () => {
  const stored = {
    outage_date: "2026-06-03",
    start_time: "05:30:00",
    end_time: "13:30:00",
    outage_type: "scheduled",
    district: "1st" as const,
    areas: [] as string[],
    partial_areas: [] as string[],
    exclusions: ["Puro, Caoayan"],
  };
  const parsed = {
    outage_date: "2026-06-03",
    start_time: "05:30",
    end_time: "13:30",
    outage_type: "scheduled",
    district: "1st" as const,
    areas: [] as string[],
    exclusions: ["Puro, Caoayan"],
  };
  assertEquals(outageMatchesStored(stored, parsed), true);
});

Deno.test("cancellation with omitted end_time still matches stored row", () => {
  const stored = {
    outage_date: "2026-06-05",
    start_time: "08:00:00",
    end_time: "17:00:00",
    outage_type: "scheduled",
    district: null,
    areas: ["Baluarte, Vigan City"],
    exclusions: [] as string[],
  };
  const parsed = {
    outage_date: "2026-06-05",
    start_time: "08:00",
    end_time: null,
    outage_type: "scheduled",
    district: null,
    areas: ["Baluarte, Vigan City"],
    exclusions: [] as string[],
  };
  assertEquals(outageMatchesStored(stored, parsed), true);
});

Deno.test("different start times do not match", () => {
  const base = {
    outage_date: "2026-06-05",
    outage_type: "scheduled",
    district: null,
    areas: ["Baluarte, Vigan City"],
    exclusions: [] as string[],
  };
  assertEquals(
    outageMatchesStored(
      { ...base, start_time: "08:00", end_time: "17:00" },
      { ...base, start_time: "09:00", end_time: "17:00" },
    ),
    false,
  );
});
