import { describe, it, expect } from "vitest";
import {
  nextWorkingDay,
  countSlots,
  openDayPasswordText,
} from "@/lib/calendar-ui";
import type { SlotDTO } from "@/lib/api-types";
import type { SlotStatusLit } from "@/lib/slot-engine/types";

// Reference week (UTC): 2026-06-01 Mon, 02 Tue, 03 Wed, 04 Thu, 05 Fri,
// 06 Sat, 07 Sun, 08 Mon ... Clinic works Wed/Thu/Fri only.
describe("nextWorkingDay", () => {
  it("steps forward Wed → Thu → Fri", () => {
    expect(nextWorkingDay("2026-06-03", 1)).toBe("2026-06-04");
    expect(nextWorkingDay("2026-06-04", 1)).toBe("2026-06-05");
  });

  it("wraps forward from Fri to next week's Wed (skips Sat–Tue)", () => {
    expect(nextWorkingDay("2026-06-05", 1)).toBe("2026-06-10");
  });

  it("steps back Fri → Thu → Wed", () => {
    expect(nextWorkingDay("2026-06-05", -1)).toBe("2026-06-04");
    expect(nextWorkingDay("2026-06-04", -1)).toBe("2026-06-03");
  });

  it("wraps back from Wed to previous week's Fri (skips Tue–Sat)", () => {
    expect(nextWorkingDay("2026-06-03", -1)).toBe("2026-05-29");
  });

  it("from a non-working day lands on the nearest working day in that direction", () => {
    // 2026-06-06 is Saturday.
    expect(nextWorkingDay("2026-06-06", -1)).toBe("2026-06-05"); // back → Fri
    expect(nextWorkingDay("2026-06-06", 1)).toBe("2026-06-10"); // fwd → Wed
  });
});

// Only `status` and `startAt` matter to countSlots; the rest is filler.
function slot(status: SlotStatusLit, startAt = "2026-06-03T08:00:00.000Z"): SlotDTO {
  return {
    id: "s",
    startAt,
    endAt: "2026-06-03T08:30:00.000Z",
    appointmentType: "PRE_HOSPITAL",
    status,
    releaseAt: null,
    color: "#000",
    lockedReason: null,
    appointment: null,
  };
}

describe("countSlots", () => {
  it("buckets AVAILABLE / BOOKED / LOCKED and ignores the rest", () => {
    const slots = [
      slot("AVAILABLE"),
      slot("AVAILABLE"),
      slot("BOOKED"),
      slot("LOCKED"),
      slot("LOCKED"),
      slot("LOCKED"),
      slot("BLOCKED"),
      slot("CANCELLED"),
      slot("COMPLETED"),
    ];
    expect(countSlots(slots)).toEqual({ available: 2, booked: 1, locked: 3 });
  });

  it("returns zeros for an empty list", () => {
    expect(countSlots([])).toEqual({ available: 0, booked: 0, locked: 0 });
  });

  it("with nowIso counts only AVAILABLE slots that haven't started yet", () => {
    const now = "2026-06-03T10:00:00.000Z";
    const slots = [
      slot("AVAILABLE", "2026-06-03T08:00:00.000Z"), // past → excluded
      slot("AVAILABLE", "2026-06-03T10:00:00.000Z"), // exactly now → excluded
      slot("AVAILABLE", "2026-06-03T12:00:00.000Z"), // future → counted
      slot("AVAILABLE", "2026-06-03T14:00:00.000Z"), // future → counted
      slot("BOOKED", "2026-06-03T08:00:00.000Z"), // booked counts regardless of time
    ];
    expect(countSlots(slots, now)).toEqual({ available: 2, booked: 1, locked: 0 });
  });
});

describe("openDayPasswordText", () => {
  it("names the day and promises immediate slots for a Wednesday", () => {
    const t = openDayPasswordText("2026-06-03"); // Wednesday
    expect(t.title).toBe("Otvoriť stredu");
    expect(t.description).toContain("bez časových obmedzení");
  });

  it("does the same for the last Friday of the month", () => {
    const t = openDayPasswordText("2026-06-26"); // last Friday of June 2026
    expect(t.title).toBe("Otvoriť posledný piatok v mesiaci");
    expect(t.description).toContain("bez časových obmedzení");
  });

  it("a holiday Thursday keeps its release windows and says so by omission", () => {
    const t = openDayPasswordText("2026-12-24"); // Štedrý deň, a Thursday
    expect(t.title).toBe("Otvoriť deň");
    expect(t.description).toContain("sviatok");
    expect(t.description).not.toContain("bez časových obmedzení");
  });

  it("a Wednesday that is also a holiday shows both", () => {
    const t = openDayPasswordText("2027-01-06"); // Traja králi, a Wednesday
    expect(t.title).toBe("Otvoriť stredu");
    expect(t.description).toContain("sviatok");
    expect(t.description).toContain("bez časových obmedzení");
  });
});
