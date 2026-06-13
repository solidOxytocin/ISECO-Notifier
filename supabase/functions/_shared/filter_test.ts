import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getAffectedLocations, shouldNotifyUser } from "./filter.ts";

Deno.test("1st district: Vigan affected, Caoayan excluded", () => {
  const outage = {
    outage_date: "2026-06-15",
    start_time: "05:30",
    end_time: "13:30",
    district: "1st" as const,
    areas: ["Nagpanaoan, Santa"],
    exclusions: ["Puro, Caoayan"],
  };

  const affected = getAffectedLocations(outage);
  assertEquals(affected.includes("Vigan City"), true);
  assertEquals(affected.includes("Caoayan"), false);
  assertEquals(affected.some((a) => a.includes("Nagpanaoan")), true);

  assertEquals(shouldNotifyUser(outage, ["Vigan City"]), true);
  assertEquals(shouldNotifyUser(outage, ["Puro, Caoayan"]), false);
  assertEquals(shouldNotifyUser(outage, ["Nagpanaoan, Santa"]), true);
});

Deno.test("2nd district only affects 2nd municipalities", () => {
  const outage = {
    outage_date: "2026-06-15",
    start_time: "08:00",
    end_time: "17:00",
    district: "2nd" as const,
    areas: [],
    exclusions: [],
  };

  assertEquals(shouldNotifyUser(outage, ["Candon City"]), true);
  assertEquals(shouldNotifyUser(outage, ["Vigan City"]), false);
});

Deno.test("specific areas only when district is null", () => {
  const outage = {
    outage_date: "2026-06-17",
    start_time: "08:30",
    end_time: "17:00",
    district: null,
    areas: ["Baluarte, Vigan City"],
    exclusions: [],
  };

  assertEquals(shouldNotifyUser(outage, ["Baluarte"]), true);
  assertEquals(shouldNotifyUser(outage, ["Salindeg, Vigan City"]), false);
});

Deno.test("partial areas notify watched barangays", () => {
  const outage = {
    outage_date: "2026-06-18",
    start_time: "08:00",
    end_time: "17:00",
    district: null,
    areas: ["Darapidap, Candon City"],
    partial_areas: ["San Jose, Candon City"],
    exclusions: [],
  };

  assertEquals(shouldNotifyUser(outage, ["San Jose, Candon City"]), true);
  assertEquals(shouldNotifyUser(outage, ["Darapidap, Candon City"]), true);
  assertEquals(shouldNotifyUser(outage, ["Salindeg, Candon City"]), false);
});
