import { describe, it, expect } from "vitest";
import {
  computeReleaseAt,
  initialSlotStatus,
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
