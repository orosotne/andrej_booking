import { describe, it, expect } from "vitest";
import { wallClockToUtc } from "@/lib/clinic-time";
import { dateOnly } from "@/lib/calendar-date";

describe("wallClockToUtc (Europe/Bratislava, DST-aware)", () => {
  it("07:00 in summer (CEST, +02:00) → 05:00Z", () => {
    const utc = wallClockToUtc(dateOnly("2026-07-03"), "07:00");
    expect(utc.toISOString()).toBe("2026-07-03T05:00:00.000Z");
  });

  it("07:00 in winter (CET, +01:00) → 06:00Z", () => {
    const utc = wallClockToUtc(dateOnly("2026-01-09"), "07:00");
    expect(utc.toISOString()).toBe("2026-01-09T06:00:00.000Z");
  });

  it("15:30 in summer → 13:30Z", () => {
    const utc = wallClockToUtc(dateOnly("2026-07-03"), "15:30");
    expect(utc.toISOString()).toBe("2026-07-03T13:30:00.000Z");
  });
});
