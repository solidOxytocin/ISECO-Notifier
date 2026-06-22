import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOutagePassed } from "./outage_time.ts";

// Fixed reference: 2026-06-22 12:00 Manila == 2026-06-22T04:00:00Z
const NOW = new Date("2026-06-22T04:00:00Z");

Deno.test("scheduled outage earlier today is passed", () => {
  assertEquals(
    isOutagePassed(
      { outage_type: "scheduled", outage_date: "2026-06-22", start_time: "08:00", end_time: "11:00" },
      NOW,
    ),
    true,
  );
});

Deno.test("scheduled outage ending later today is NOT passed", () => {
  assertEquals(
    isOutagePassed(
      { outage_type: "scheduled", outage_date: "2026-06-22", start_time: "13:00", end_time: "17:00" },
      NOW,
    ),
    false,
  );
});

Deno.test("future scheduled outage is NOT passed", () => {
  assertEquals(
    isOutagePassed(
      { outage_type: "scheduled", outage_date: "2026-06-25", start_time: "08:00", end_time: "11:00" },
      NOW,
    ),
    false,
  );
});

Deno.test("emergency earlier today is NOT passed (no end time, day not over)", () => {
  assertEquals(
    isOutagePassed(
      { outage_type: "emergency", outage_date: "2026-06-22", start_time: "06:00", end_time: null },
      NOW,
    ),
    false,
  );
});

Deno.test("emergency from a previous day is passed", () => {
  assertEquals(
    isOutagePassed(
      { outage_type: "emergency", outage_date: "2026-06-21", start_time: "06:00", end_time: null },
      NOW,
    ),
    true,
  );
});

Deno.test("unparseable date fails open (not passed)", () => {
  assertEquals(
    isOutagePassed(
      { outage_type: "scheduled", outage_date: "not-a-date", start_time: "08:00", end_time: "11:00" },
      NOW,
    ),
    false,
  );
});
