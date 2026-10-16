import { describe, it, expect } from "vitest";
import {
  isLastFridayOfMonth,
  isGatedLastFriday,
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
  it("the last Friday of 2027 is still LAST_FRIDAY", () =>
    expect(defaultDayType(dateOnly("2027-12-31"))).toBe("LAST_FRIDAY"));
  it("from 2028 the last Friday is an ordinary REGULAR_FRIDAY", () =>
    expect(defaultDayType(dateOnly("2028-01-28"))).toBe("REGULAR_FRIDAY"));
});

describe("isGatedLastFriday (password-gated last Friday, only until 2027)", () => {
  it("true for the last Friday of December 2027", () => {
    expect(isGatedLastFriday(dateOnly("2027-12-31"))).toBe(true);
  });
  it("false for the last Friday of January 2028", () => {
    expect(isGatedLastFriday(dateOnly("2028-01-28"))).toBe(false);
  });
  it("false for a Friday that is not the last one", () => {
    expect(isGatedLastFriday(dateOnly("2027-12-24"))).toBe(false);
  });
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
