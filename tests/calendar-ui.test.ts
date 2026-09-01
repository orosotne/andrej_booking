import { describe, it, expect } from "vitest";
import {
  nextWorkingDay,
  countSlots,
  availByType,
  tallyDayByType,
  monthGridCells,
  weekdayOf,
  openDayPasswordText,
} from "@/lib/calendar-ui";
import type { SlotDTO } from "@/lib/api-types";
import type {
  AppointmentTypeLit,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

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

// countSlots only reads `status` and `startAt`; availByType and tallyDayByType
// also read `appointmentType` and `color`. The rest is filler.
function slot(
  status: SlotStatusLit,
  startAt = "2026-06-03T08:00:00.000Z",
  opts: { type?: AppointmentTypeLit; color?: string } = {},
): SlotDTO {
  return {
    id: "s",
    startAt,
    endAt: "2026-06-03T08:30:00.000Z",
    appointmentType: opts.type ?? "PRE_HOSPITAL",
    status,
    releaseAt: null,
    color: opts.color ?? "#000",
    lockedReason: null,
    appointment: null,
  };
}

/** Shorthand: a slot of a given type/colour, start time irrelevant. */
function typed(
  status: SlotStatusLit,
  type: AppointmentTypeLit,
  color = "blue",
): SlotDTO {
  return slot(status, "2026-06-03T08:00:00.000Z", { type, color });
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

describe("tallyDayByType", () => {
  const empty = { free: 0, locked: 0, booked: 0 };

  it("rolls PRE_HOSPITAL and ACUTE_RESERVE together under akútne", () => {
    const t = tallyDayByType([
      typed("AVAILABLE", "PRE_HOSPITAL"),
      typed("AVAILABLE", "ACUTE_RESERVE"),
      typed("LOCKED", "PRE_HOSPITAL"),
      typed("BOOKED", "ACUTE_RESERVE"),
    ]);
    expect(t.akut).toEqual({ free: 2, locked: 1, booked: 1 });
    expect(t.disp).toEqual(empty);
    expect(t.echo).toEqual(empty);
  });

  it("splits DISPENSARY across free / locked / booked", () => {
    const t = tallyDayByType([
      typed("AVAILABLE", "DISPENSARY"),
      typed("LOCKED", "DISPENSARY"),
      typed("LOCKED", "DISPENSARY"),
      typed("BOOKED", "DISPENSARY"),
    ]);
    expect(t.disp).toEqual({ free: 1, locked: 2, booked: 1 });
    expect(t.akut).toEqual(empty);
  });

  it("counts plain ECHO under echo", () => {
    const t = tallyDayByType([
      typed("AVAILABLE", "ECHO", "blue"),
      typed("LOCKED", "ECHO", "blue"),
      typed("BOOKED", "ECHO", "blue"),
    ]);
    expect(t.echo).toEqual({ free: 1, locked: 1, booked: 1 });
  });

  it("excludes yellow PENTA slots from the echo free count", () => {
    const t = tallyDayByType([
      typed("AVAILABLE", "ECHO", "blue"),
      typed("AVAILABLE", "ECHO", "yellow"),
    ]);
    expect(t.echo.free).toBe(1);
  });

  it("excludes yellow PENTA slots from the echo locked count", () => {
    const t = tallyDayByType([
      typed("LOCKED", "ECHO", "blue"),
      typed("LOCKED", "ECHO", "yellow"),
      typed("LOCKED", "ECHO", "yellow"),
      typed("LOCKED", "ECHO", "yellow"),
    ]);
    expect(t.echo.locked).toBe(1);
  });

  it("excludes yellow PENTA slots from the echo booked count", () => {
    const t = tallyDayByType([
      typed("BOOKED", "ECHO", "blue"),
      typed("BOOKED", "ECHO", "yellow"),
    ]);
    expect(t.echo.booked).toBe(1);
  });

  it("never counts ECHO_DEPARTMENT_BLOCKED, whatever its status", () => {
    const t = tallyDayByType([
      typed("BLOCKED", "ECHO_DEPARTMENT_BLOCKED", "navy"),
      typed("AVAILABLE", "ECHO_DEPARTMENT_BLOCKED", "navy"),
      typed("LOCKED", "ECHO_DEPARTMENT_BLOCKED", "navy"),
    ]);
    expect(t.echo).toEqual(empty);
  });

  it("never counts CONSULTATION_BLOCKED or CUSTOM", () => {
    const t = tallyDayByType([
      typed("BLOCKED", "CONSULTATION_BLOCKED", "grey"),
      typed("AVAILABLE", "CONSULTATION_BLOCKED", "grey"),
      typed("AVAILABLE", "CUSTOM", "white"),
      typed("BOOKED", "CUSTOM", "white"),
    ]);
    expect(t).toEqual({ akut: empty, disp: empty, echo: empty });
  });

  it("ignores BLOCKED / CANCELLED / COMPLETED slot statuses", () => {
    // A closed day: every bookable slot has been flipped to BLOCKED.
    const t = tallyDayByType([
      typed("BLOCKED", "PRE_HOSPITAL", "pink"),
      typed("BLOCKED", "DISPENSARY", "white"),
      typed("CANCELLED", "ECHO", "blue"),
      typed("COMPLETED", "ECHO", "blue"),
    ]);
    expect(t).toEqual({ akut: empty, disp: empty, echo: empty });
  });

  it("returns three zeroed tallies for an empty list", () => {
    expect(tallyDayByType([])).toEqual({ akut: empty, disp: empty, echo: empty });
  });
});

// Regression lock: the PENTA rule belongs to the month cells only. The summary
// strip above the grid must keep reporting total echo capacity.
describe("availByType is unchanged by the PENTA rule", () => {
  it("still counts a yellow ECHO slot under echo", () => {
    const r = availByType([
      typed("AVAILABLE", "ECHO", "yellow"),
      typed("BOOKED", "ECHO", "yellow"),
    ]);
    expect(r.echo).toEqual({ free: 1, total: 2 });
  });

  it("still rolls the blocked types under custom", () => {
    const r = availByType([
      typed("AVAILABLE", "ECHO_DEPARTMENT_BLOCKED", "navy"),
      typed("AVAILABLE", "CUSTOM", "white"),
    ]);
    expect(r.custom).toEqual({ free: 2, total: 2 });
  });
});

describe("monthGridCells", () => {
  const days = (anchor: string) => monthGridCells(anchor);
  const shown = (anchor: string) =>
    days(anchor).filter((d): d is string => d !== null);

  it("always returns whole weeks of Wed/Thu/Fri", () => {
    for (const m of ["2026-09-01", "2026-10-01", "2026-11-01", "2027-02-01"]) {
      const cells = days(m);
      expect(cells.length % 3).toBe(0);
      cells.forEach((iso, i) => {
        // position % 3 → 0 = Wed, 1 = Thu, 2 = Fri, spacers included
        if (iso !== null) expect(weekdayOf(iso)).toBe(3 + (i % 3));
      });
    }
  });

  it("never shows a day from a neighbouring month", () => {
    for (const m of ["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"]) {
      expect(shown(m).every((iso) => iso.slice(0, 7) === m.slice(0, 7))).toBe(true);
    }
  });

  it("shows every Wed/Thu/Fri of the month, in order", () => {
    // September 2026: Wednesdays 2/9/16/23/30, Thursdays 3/10/17/24, Fridays 4/11/18/25.
    expect(shown("2026-09-01")).toEqual([
      "2026-09-02", "2026-09-03", "2026-09-04",
      "2026-09-09", "2026-09-10", "2026-09-11",
      "2026-09-16", "2026-09-17", "2026-09-18",
      "2026-09-23", "2026-09-24", "2026-09-25",
      "2026-09-30",
    ]);
  });

  it("pads a trailing week so the last Wednesday keeps its column", () => {
    // 2026-09-30 is a Wednesday; Oct 1 and 2 become spacers, not dropped.
    const cells = days("2026-09-01");
    expect(cells.slice(-3)).toEqual(["2026-09-30", null, null]);
  });

  it("pads a leading week the same way", () => {
    // October 2026 opens on Thursday the 1st, so the Wednesday slot is a spacer.
    expect(days("2026-10-01").slice(0, 3)).toEqual([null, "2026-10-01", "2026-10-02"]);
  });

  it("drops weeks made entirely of other months' days", () => {
    // November 2026 starts on a Sunday and ends on a Monday, so its clinic
    // weeks line up exactly: 4 rows, no spacers at all.
    const cells = days("2026-11-01");
    expect(cells).toHaveLength(12);
    expect(cells.includes(null)).toBe(false);
    expect(cells[0]).toBe("2026-11-04");
    expect(cells[11]).toBe("2026-11-27");
  });

  it("handles a short February", () => {
    // 2027-02-01 is a Monday; February 2027 has 28 days, ending Sunday the 28th.
    const feb = shown("2027-02-01");
    expect(feb[0]).toBe("2027-02-03");
    expect(feb[feb.length - 1]).toBe("2027-02-26");
    expect(feb.every((iso) => iso.startsWith("2027-02"))).toBe(true);
  });

  it("is stable whichever day of the month the anchor is", () => {
    expect(days("2026-09-01")).toEqual(days("2026-09-17"));
  });
});
