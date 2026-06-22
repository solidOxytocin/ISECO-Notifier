import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldSkipNonOutagePost } from "./post_filter.ts";

Deno.test("skips holiday advisory posts", () => {
  const result = shouldSkipNonOutagePost(
    "ISECO HOLIDAY ADVISORY\nISECO will be closed on June 12, 2026 in observance of Independence Day.",
  );
  assertEquals(result.skip, true);
  assertEquals(result.reason, "holiday_advisory");
});

Deno.test("skips celebration and leadership posts", () => {
  const result = shouldSkipNonOutagePost(
    "In celebration of GM's Month, ISECO honors the leadership of Ms. Lawrence A. Severo, CPA.",
  );
  assertEquals(result.skip, true);
  assertEquals(result.reason, "celebration");
});

Deno.test("does not skip scheduled power interruption captions", () => {
  assertEquals(
    shouldSkipNonOutagePost("NGCP RESCHEDULED POWER INTERRUPTION").skip,
    false,
  );
  assertEquals(
    shouldSkipNonOutagePost(
      "ISECO VIGAN Power Update\nScheduled Power Interruption.\nJune 15-19, 2026",
    ).skip,
    false,
  );
});

Deno.test("does not skip empty captions", () => {
  assertEquals(shouldSkipNonOutagePost("").skip, false);
  assertEquals(shouldSkipNonOutagePost("   ").skip, false);
});

Deno.test("does not skip emergency power interruption captions", () => {
  const result = shouldSkipNonOutagePost(
    "ISECO Vigan Power Advisory\nEmergency Power Interruption\nJune 10, 2026\nAs of 4:59 Pm",
  );
  assertEquals(result.skip, false);
});

Deno.test("outage signal overrides billing keywords in same caption", () => {
  const result = shouldSkipNonOutagePost(
    "Scheduled Power Interruption — bill payments may be delayed at affected offices.",
  );
  assertEquals(result.skip, false);
});
