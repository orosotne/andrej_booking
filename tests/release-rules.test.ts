import { describe, it, expect } from "vitest";
import {
  computeReleaseAt,
  initialSlotStatus,
  isPasswordOnlySlot,
} from "@/lib/slot-engine/release-rules";
import { dateOnly } from "@/lib/calendar-date";

const friday = dateOnly("2026-07-03");

describe("computeReleaseAt", () => {
  it("DAYS_BEFORE(42) → 42 days before", () => {
    const r = computeReleaseAt(friday, { type: "DAYS_BEFORE", daysBefore: 42 }, false)!;
    expect(r.toISOString().slice(0, 10)).toBe("2026-05-22");
  });
  it("DAYS_BEFORE(28) for ECHO", () => {
    const r = computeReleaseAt(friday, { type: "DAYS_BEFORE", daysBefore: 28 }, false)!;
    expect(r.toISOString().slice(0, 10)).toBe("2026-06-05");
  });
  it("MONTHS_BEFORE(6) keeps the day of month", () => {
    const r = computeReleaseAt(friday, { type: "MONTHS_BEFORE", monthsBefore: 6 }, false)!;
    expect(r.toISOString().slice(0, 10)).toBe("2026-01-03");
  });
  it("MONTHS_BEFORE(3) crosses the year boundary", () => {
    const r = computeReleaseAt(
      dateOnly("2027-02-11"),
      { type: "MONTHS_BEFORE", monthsBefore: 3 },
      false,
    )!;
    expect(r.toISOString().slice(0, 10)).toBe("2026-11-11");
  });
  it("MONTHS_BEFORE(1) on the 1st of the month", () => {
    const r = computeReleaseAt(
      dateOnly("2027-01-01"),
      { type: "MONTHS_BEFORE", monthsBefore: 1 },
      false,
    )!;
    expect(r.toISOString().slice(0, 10)).toBe("2026-12-01");
  });
  it("MONTHS_BEFORE clamps to the target month's last day instead of overflowing", () => {
    // 31 Aug − 6 months is 31 Feb, which must land on 28 Feb (2027 is not a leap year).
    const r = computeReleaseAt(
      dateOnly("2027-08-31"),
      { type: "MONTHS_BEFORE", monthsBefore: 6 },
      false,
    )!;
    expect(r.toISOString().slice(0, 10)).toBe("2027-02-28");
  });
  it("MONTHS_BEFORE clamp honours a leap February", () => {
    const r = computeReleaseAt(
      dateOnly("2028-08-31"),
      { type: "MONTHS_BEFORE", monthsBefore: 6 },
      false,
    )!;
    expect(r.toISOString().slice(0, 10)).toBe("2028-02-29");
  });
  it("MONTHS_BEFORE is normalised to 06:00 UTC like every other policy", () => {
    const r = computeReleaseAt(friday, { type: "MONTHS_BEFORE", monthsBefore: 6 }, false)!;
    expect(r.toISOString()).toBe("2026-01-03T06:00:00.000Z");
  });
  it("MANUAL_ONLY → null", () => {
    expect(computeReleaseAt(friday, { type: "MANUAL_ONLY" }, false)).toBeNull();
  });
  it("IMMEDIATE → already in the past", () => {
    const r = computeReleaseAt(friday, { type: "IMMEDIATE" }, false)!;
    expect(r.getTime()).toBeLessThanOrEqual(Date.now());
  });
  it("LAST_FRIDAY policy is null when the day is not a last Friday", () => {
    expect(
      computeReleaseAt(friday, { type: "LAST_FRIDAY_30_DAYS_BEFORE" }, false),
    ).toBeNull();
  });
  it("LAST_FRIDAY policy → 30 days before on a last Friday", () => {
    const lastFri = dateOnly("2026-07-31");
    const r = computeReleaseAt(lastFri, { type: "LAST_FRIDAY_30_DAYS_BEFORE" }, true)!;
    expect(r.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
});

describe("initialSlotStatus", () => {
  const now = dateOnly("2026-06-01");
  it("poradňa block is always BLOCKED", () => {
    expect(initialSlotStatus("CONSULTATION_BLOCKED", new Date(0), now)).toBe("BLOCKED");
  });
  it("AVAILABLE when release_at already passed", () => {
    expect(initialSlotStatus("DISPENSARY", dateOnly("2026-05-22"), now)).toBe("AVAILABLE");
  });
  it("LOCKED when release_at is in the future", () => {
    expect(initialSlotStatus("DISPENSARY", dateOnly("2026-07-01"), now)).toBe("LOCKED");
  });
  it("LOCKED when release_at is null (manual only)", () => {
    expect(initialSlotStatus("ACUTE_RESERVE", null, now)).toBe("LOCKED");
  });
});

describe("isPasswordOnlySlot (13:30/13:50/14:10 blocked from Feb 2027)", () => {
  it("applies from 2027-02-01 onwards", () => {
    expect(isPasswordOnlySlot(dateOnly("2027-02-01"), "13:30")).toBe(true);
    expect(isPasswordOnlySlot(dateOnly("2027-02-04"), "13:50")).toBe(true);
    expect(isPasswordOnlySlot(dateOnly("2028-06-15"), "14:10")).toBe(true);
  });
  it("does not apply before February 2027", () => {
    expect(isPasswordOnlySlot(dateOnly("2027-01-31"), "13:30")).toBe(false);
    expect(isPasswordOnlySlot(dateOnly("2026-08-06"), "13:50")).toBe(false);
  });
  it("affects only the three listed times", () => {
    expect(isPasswordOnlySlot(dateOnly("2027-02-04"), "14:40")).toBe(false);
    expect(isPasswordOnlySlot(dateOnly("2027-02-04"), "15:00")).toBe(false);
    expect(isPasswordOnlySlot(dateOnly("2027-02-04"), "09:00")).toBe(false);
  });
});
