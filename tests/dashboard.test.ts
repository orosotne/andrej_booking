import { describe, it, expect } from "vitest";
import {
  pickFocusDays,
  missingWorkingDays,
  upcomingHolidayClosures,
  openedWednesdays,
  noShowRate,
  bucketCapacity,
  trendRange,
  type DaySummary,
  type CapacitySlot,
} from "@/lib/dashboard";

// Reference: 2026-06-01 Mon … 03 Wed, 04 Thu, 05 Fri. Clinic works Wed/Thu/Fri.
const day = (date: string, p: Partial<DaySummary> = {}): DaySummary => ({
  date,
  status: "OPEN",
  dayType: "REGULAR_THURSDAY",
  note: null,
  slotCount: 13,
  ...p,
});

describe("pickFocusDays", () => {
  it("leads with today when today is a working day with slots", () => {
    const r = pickFocusDays([day("2026-06-04"), day("2026-06-05")], "2026-06-04");
    expect(r.focus?.date).toBe("2026-06-04");
    expect(r.next?.date).toBe("2026-06-05");
    expect(r.isToday).toBe(true);
  });

  it("on a Monday leads with the next working day, not an empty today", () => {
    const r = pickFocusDays([day("2026-06-04"), day("2026-06-05")], "2026-06-01");
    expect(r.focus?.date).toBe("2026-06-04");
    expect(r.isToday).toBe(false);
  });

  it("skips a closed day (holiday / vacation)", () => {
    const r = pickFocusDays(
      [day("2026-06-04", { status: "CLOSED" }), day("2026-06-05")],
      "2026-06-04",
    );
    expect(r.focus?.date).toBe("2026-06-05");
    expect(r.isToday).toBe(false);
  });

  it("skips a day row that exists but has no slots", () => {
    const r = pickFocusDays(
      [day("2026-06-04", { slotCount: 0 }), day("2026-06-05")],
      "2026-06-04",
    );
    expect(r.focus?.date).toBe("2026-06-05");
  });

  it("never looks backwards", () => {
    const r = pickFocusDays([day("2026-06-04")], "2026-06-05");
    expect(r.focus).toBeNull();
    expect(r.next).toBeNull();
    expect(r.isToday).toBe(false);
  });

  it("returns nulls when nothing is generated", () => {
    expect(pickFocusDays([], "2026-06-01").focus).toBeNull();
  });
});

describe("missingWorkingDays", () => {
  it("lists a Thursday with no calendar day at all", () => {
    const out = missingWorkingDays([day("2026-06-05")], "2026-06-04", 1);
    expect(out).toContain("2026-06-04");
  });

  it("lists a day whose row exists but has zero slots", () => {
    const out = missingWorkingDays(
      [
        day("2026-06-04", { slotCount: 0 }),
        day("2026-06-05"),
        day("2026-06-11"),
        day("2026-06-12"),
      ],
      "2026-06-04",
      1,
    );
    expect(out).toEqual(["2026-06-04"]);
  });

  it("NEVER lists a Wednesday — generateForward skips those on purpose", () => {
    // 2026-06-03, 10, 17, 24 are Wednesdays with no rows at all.
    const out = missingWorkingDays([], "2026-06-01", 4);
    expect(out.filter((iso) => iso.endsWith("-03"))).toEqual([]);
    for (const wed of ["2026-06-03", "2026-06-10", "2026-06-17", "2026-06-24"]) {
      expect(out).not.toContain(wed);
    }
  });

  it("NEVER lists the last Friday of a month — also skipped by the generator", () => {
    // 2026-06-26 is the last Friday of June 2026.
    const out = missingWorkingDays([], "2026-06-01", 5);
    expect(out).not.toContain("2026-06-26");
    expect(out).toContain("2026-06-19"); // the Friday before it is a real gap
  });

  it("does not flag a holiday — those are closed deliberately", () => {
    // 2026-12-24 (Štedrý deň) is a Thursday; 2026-12-25 a Friday holiday too.
    const out = missingWorkingDays([], "2026-12-21", 1);
    expect(out).not.toContain("2026-12-24");
    expect(out).not.toContain("2026-12-25");
  });

  it("is empty when every Thu/Fri is generated", () => {
    const days = [day("2026-06-04"), day("2026-06-05")];
    expect(missingWorkingDays(days, "2026-06-04", 0)).toEqual([]);
  });
});

describe("upcomingHolidayClosures", () => {
  it("reports a holiday that lands on a clinic day and is not yet closed", () => {
    // 2027-01-01 (Deň vzniku SR) is a Friday.
    const out = upcomingHolidayClosures([day("2027-01-01")], "2026-12-28", 5);
    expect(out).toEqual([
      { iso: "2027-01-01", name: expect.any(String), handled: false },
    ]);
  });

  it("marks it handled once the day is CLOSED", () => {
    const out = upcomingHolidayClosures(
      [day("2027-01-01", { status: "CLOSED" })],
      "2026-12-28",
      5,
    );
    expect(out[0].handled).toBe(true);
  });

  it("treats a holiday with no generated day as handled", () => {
    const out = upcomingHolidayClosures([], "2026-12-28", 5);
    expect(out[0].handled).toBe(true);
  });

  it("ignores holidays outside Wed/Thu/Fri", () => {
    // 2026-05-01 (Sviatok práce) is a Friday; 2026-05-08 also a Friday.
    // 2027-05-01 is a Saturday → must not appear.
    const out = upcomingHolidayClosures([], "2027-04-25", 14);
    expect(out.map((h) => h.iso)).not.toContain("2027-05-01");
  });
});

describe("openedWednesdays", () => {
  it("lists future manual Wednesdays that carry slots", () => {
    const out = openedWednesdays(
      [
        day("2026-06-03", { dayType: "MANUAL_WEDNESDAY" }),
        day("2026-06-10", { dayType: "MANUAL_WEDNESDAY", slotCount: 0 }),
        day("2026-06-17", { dayType: "MANUAL_WEDNESDAY", status: "CLOSED" }),
        day("2026-06-04"),
      ],
      "2026-06-01",
    );
    expect(out).toEqual(["2026-06-03"]);
  });
});

describe("noShowRate", () => {
  it("is the share of resolved appointments that were no-shows", () => {
    expect(noShowRate({ arrived: 7, completed: 1, noShow: 2 })).toBeCloseTo(0.2);
  });

  it("is null — not zero — when nothing has been resolved", () => {
    expect(noShowRate({ arrived: 0, completed: 0, noShow: 0 })).toBeNull();
  });

  it("is 1 when every resolved appointment was a no-show", () => {
    expect(noShowRate({ arrived: 0, completed: 0, noShow: 3 })).toBe(1);
  });
});

describe("bucketCapacity", () => {
  const slot = (
    startAt: string,
    appointmentType: string,
    status = "AVAILABLE",
  ): CapacitySlot => ({ startAt, appointmentType, status });

  it("rolls PRE_HOSPITAL and ACUTE_RESERVE together, like availByType", () => {
    const r = bucketCapacity(
      [
        slot("2026-06-05T05:00:00.000Z", "PRE_HOSPITAL"),
        slot("2026-06-05T05:30:00.000Z", "ACUTE_RESERVE"),
      ],
      "2026-06-04",
    );
    expect(r.akut.free30).toBe(2);
  });

  it("counts AVAILABLE + BOOKED as capacity but only AVAILABLE as free", () => {
    const r = bucketCapacity(
      [
        slot("2026-06-05T07:00:00.000Z", "DISPENSARY"),
        slot("2026-06-05T07:30:00.000Z", "DISPENSARY", "BOOKED"),
        slot("2026-06-05T08:00:00.000Z", "DISPENSARY", "LOCKED"),
      ],
      "2026-06-04",
    );
    expect(r.disp).toEqual({ free14: 1, free30: 1, total30: 2 });
  });

  it("makes the 14-day window a strict subset of the 30-day one", () => {
    const r = bucketCapacity(
      [
        slot("2026-06-10T12:00:00.000Z", "ECHO"), // within 14 days
        slot("2026-06-30T12:00:00.000Z", "ECHO"), // day 26 — outside 14
      ],
      "2026-06-04",
    );
    expect(r.echo.free14).toBe(1);
    expect(r.echo.free30).toBe(2);
  });

  it("ignores the blocked types and CUSTOM", () => {
    const r = bucketCapacity(
      [
        slot("2026-06-05T10:30:00.000Z", "ECHO_DEPARTMENT_BLOCKED"),
        slot("2026-06-05T06:00:00.000Z", "CONSULTATION_BLOCKED"),
        slot("2026-06-05T09:00:00.000Z", "CUSTOM"),
      ],
      "2026-06-04",
    );
    expect(r).toEqual({
      akut: { free14: 0, free30: 0, total30: 0 },
      disp: { free14: 0, free30: 0, total30: 0 },
      echo: { free14: 0, free30: 0, total30: 0 },
    });
  });

  it("counts a slot on the 14th day itself as inside the window", () => {
    const r = bucketCapacity(
      [slot("2026-06-18T07:00:00.000Z", "DISPENSARY")],
      "2026-06-04",
    );
    expect(r.disp.free14).toBe(1);
  });
});

describe("trendRange", () => {
  it("spans the current month plus the eleven before it", () => {
    expect(trendRange("2026-06-15")).toEqual({
      from: "2025-07-01",
      to: "2026-06-15",
    });
  });

  it("crosses the year boundary correctly", () => {
    expect(trendRange("2026-01-05")).toEqual({
      from: "2025-02-01",
      to: "2026-01-05",
    });
  });
});
