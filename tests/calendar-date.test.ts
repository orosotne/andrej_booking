import { describe, it, expect } from "vitest";
import {
  isLastFridayOfMonth,
  defaultDayType,
  weekdaysInMonth,
  WEEKDAY,
  dateOnly,
} from "@/lib/calendar-date";

describe("isLastFridayOfMonth", () => {
  it("true for 2026-05-29 (last Friday of May)", () => {
    expect(isLastFridayOfMonth(dateOnly("2026-05-29"))).toBe(true);
  });
  it("false for 2026-05-22 (not the last Friday)", () => {
    expect(isLastFridayOfMonth(dateOnly("2026-05-22"))).toBe(false);
  });
  it("false for a Thursday", () => {
    expect(isLastFridayOfMonth(dateOnly("2026-05-28"))).toBe(false);
  });
  it("true for 2026-07-31 (last Friday of July)", () => {
    expect(isLastFridayOfMonth(dateOnly("2026-07-31"))).toBe(true);
  });
});

describe("defaultDayType", () => {
  it("REGULAR_THURSDAY", () =>
    expect(defaultDayType(dateOnly("2026-07-02"))).toBe("REGULAR_THURSDAY"));
  it("REGULAR_FRIDAY", () =>
    expect(defaultDayType(dateOnly("2026-07-03"))).toBe("REGULAR_FRIDAY"));
  it("LAST_FRIDAY", () =>
    expect(defaultDayType(dateOnly("2026-07-31"))).toBe("LAST_FRIDAY"));
  it("MANUAL_WEDNESDAY", () =>
    expect(defaultDayType(dateOnly("2026-07-01"))).toBe("MANUAL_WEDNESDAY"));
  it("CLOSED for Monday", () =>
    expect(defaultDayType(dateOnly("2026-06-29"))).toBe("CLOSED"));
});

describe("weekdaysInMonth", () => {
  it("finds all Wednesdays of July 2026", () => {
    const weds = weekdaysInMonth(dateOnly("2026-07-15"), WEEKDAY.WED);
    expect(weds.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-07-01",
      "2026-07-08",
      "2026-07-15",
      "2026-07-22",
      "2026-07-29",
    ]);
  });
});
