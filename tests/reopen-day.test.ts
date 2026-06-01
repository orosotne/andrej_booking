import { describe, it, expect } from "vitest";
import { partitionReopenSlots } from "@/lib/slot-engine/release-rules";
import { dateOnly } from "@/lib/calendar-date";

const now = dateOnly("2026-06-01");

describe("partitionReopenSlots", () => {
  it("reopens released slots, locks the rest, leaves blocks and booked slots", () => {
    const slots = [
      // released → bookable again
      { id: "a", appointmentType: "DISPENSARY", releaseAt: dateOnly("2026-05-22"), status: "BLOCKED" },
      // not yet released → back to LOCKED
      { id: "b", appointmentType: "ECHO", releaseAt: dateOnly("2026-07-01"), status: "BLOCKED" },
      // manual-only → back to LOCKED
      { id: "c", appointmentType: "ACUTE_RESERVE", releaseAt: null, status: "BLOCKED" },
      // poradňa is a rule-level block, not a close-block → stays BLOCKED
      { id: "d", appointmentType: "CONSULTATION_BLOCKED", releaseAt: null, status: "BLOCKED" },
      // a kept appointment → never touched by reopen
      { id: "e", appointmentType: "DISPENSARY", releaseAt: dateOnly("2026-05-22"), status: "BOOKED" },
    ] as const;

    const { toAvailable, toLocked } = partitionReopenSlots([...slots], now);

    expect(toAvailable).toEqual(["a"]);
    expect(toLocked).toEqual(["b", "c"]);
  });
});
