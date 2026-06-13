import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldNotifyUser } from "./filter.ts";

Deno.test("notify all when no barangays set", () => {
  assertEquals(
    shouldNotifyUser(
      { outage_date: "2026-06-15", start_time: "08:00", end_time: "17:00", areas: ["Vigan"] },
      [],
    ),
    true,
  );
});

Deno.test("district-wide excludes barangay", () => {
  assertEquals(
    shouldNotifyUser(
      {
        outage_date: "2026-06-15",
        start_time: "05:30",
        end_time: "13:30",
        areas: ["Whole 1st District"],
        exclusions: ["Puro, Caoayan"],
        is_district_wide: true,
      },
      ["Puro, Caoayan"],
    ),
    false,
  );
});

Deno.test("matches specific barangay", () => {
  assertEquals(
    shouldNotifyUser(
      {
        outage_date: "2026-06-17",
        start_time: "08:30",
        end_time: "17:00",
        areas: ["Baluarte, Vigan City"],
      },
      ["Baluarte"],
    ),
    true,
  );
});
