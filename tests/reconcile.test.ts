import { describe, it, expect } from "vitest";
import {
  expandTemplateRules,
  diffDaySlots,
  isManuallyOpenedDay,
  type RuleForExpansion,
  type DesiredSlot,
  type ExistingSlot,
} from "@/lib/slot-engine/reconcile";
import { dateOnly } from "@/lib/calendar-date";

const thursday = dateOnly("2026-07-02"); // a normal (non-last) Thursday
const now = dateOnly("2026-06-01");

function rule(p: Partial<RuleForExpansion>): RuleForExpansion {
  return {
    id: "r",
    startTime: "09:00",
    endTime: "09:30",
    slotDurationMinutes: 30,
    appointmentType: "DISPENSARY",
    color: "white",
    releasePolicy: { releaseType: "IMMEDIATE", daysBefore: null },
    ...p,
  };
}

describe("expandTemplateRules", () => {
  it("expands a block into sub-slots of the rule duration", () => {
    const slots = expandTemplateRules(
      [rule({ startTime: "09:00", endTime: "11:00", slotDurationMinutes: 30 })],
      thursday,
      now,
    );
    expect(slots).toHaveLength(4); // 9:00, 9:30, 10:00, 10:30
    expect(slots.every((s) => s.appointmentType === "DISPENSARY")).toBe(true);
  });

  it("IMMEDIATE slots open right away (AVAILABLE)", () => {
    const [s] = expandTemplateRules(
      [rule({ startTime: "07:00", endTime: "07:30" })],
      thursday,
      now,
    );
    expect(s.status).toBe("AVAILABLE");
  });

  it("DAYS_BEFORE slots whose window hasn't opened yet are LOCKED", () => {
    const [s] = expandTemplateRules(
      [
        rule({
          startTime: "11:30",
          endTime: "12:00",
          releasePolicy: { releaseType: "DAYS_BEFORE", daysBefore: 6 },
        }),
      ],
      thursday,
      now,
    );
    // 6 days before 2026-07-02 = 2026-06-26, still after now (2026-06-01) → LOCKED
    expect(s.status).toBe("LOCKED");
    expect(s.releaseAt?.toISOString().slice(0, 10)).toBe("2026-06-26");
  });

  it("MONTHS_BEFORE opens on the same day of month, 6 months earlier", () => {
    const [s] = expandTemplateRules(
      [
        rule({
          startTime: "11:30",
          endTime: "12:00",
          releasePolicy: { releaseType: "MONTHS_BEFORE", daysBefore: null, monthsBefore: 6 },
        }),
      ],
      thursday,
      now,
    );
    // 6 months before 2026-07-02 = 2026-01-02, already past now → AVAILABLE
    expect(s.releaseAt?.toISOString().slice(0, 10)).toBe("2026-01-02");
    expect(s.status).toBe("AVAILABLE");
  });

  it("a MONTHS_BEFORE policy with no value stays LOCKED rather than opening", () => {
    const [s] = expandTemplateRules(
      [
        rule({
          startTime: "12:00",
          endTime: "12:30",
          releasePolicy: { releaseType: "MONTHS_BEFORE", daysBefore: null, monthsBefore: null },
        }),
      ],
      thursday,
      now,
    );
    expect(s.releaseAt).toBeNull();
    expect(s.status).toBe("LOCKED");
  });

  it("blocked types stay BLOCKED regardless of policy", () => {
    const slots = expandTemplateRules(
      [
        rule({
          startTime: "08:00",
          endTime: "09:00",
          appointmentType: "CONSULTATION_BLOCKED",
          color: "grey",
          releasePolicy: null,
        }),
      ],
      thursday,
      now,
    );
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.status === "BLOCKED")).toBe(true);
  });
});

describe("manually opened days (streda / posledný piatok otvorené heslom)", () => {
  const wednesday = dateOnly("2026-09-02");
  const lastFriday = dateOnly("2026-09-25"); // last Friday of September 2026
  const opened = { manuallyOpened: true };

  it("a 6-month dispenzár block opens right away on an opened Wednesday", () => {
    const months = rule({
      startTime: "09:00",
      endTime: "09:30",
      releasePolicy: { releaseType: "MONTHS_BEFORE", daysBefore: null, monthsBefore: 6 },
    });
    // Without the manual open the window (2026-03-02) has passed by `now`
    // only because `now` is 2026-06-01 — use a day far enough out to lock it.
    const far = dateOnly("2027-06-02");
    expect(expandTemplateRules([months], far, now)[0].status).toBe("LOCKED");

    const [s] = expandTemplateRules([months], far, now, opened);
    expect(s.status).toBe("AVAILABLE");
    expect(s.releaseAt).toEqual(new Date(0));
    // The regular (non-opened) Wednesday still follows its policy.
    expect(expandTemplateRules([months], wednesday, now)[0].releaseAt).toEqual(
      new Date("2026-03-02T06:00:00.000Z"),
    );
  });

  it("an opened last Friday drops the 30-days-before override", () => {
    const dispensary = rule({
      startTime: "10:00",
      endTime: "10:30",
      releasePolicy: { releaseType: "IMMEDIATE", daysBefore: null },
    });
    // 30 days before 2026-09-25 = 2026-08-26, still after now → LOCKED.
    const [regular] = expandTemplateRules([dispensary], lastFriday, now);
    expect(regular.status).toBe("LOCKED");

    const [s] = expandTemplateRules([dispensary], lastFriday, now, opened);
    expect(s.status).toBe("AVAILABLE");
    expect(s.releaseAt).toEqual(new Date(0));
  });

  it("blocked blocks (porada, ECHO oddelenie) stay BLOCKED", () => {
    const slots = expandTemplateRules(
      [
        rule({
          startTime: "08:00",
          endTime: "09:00",
          appointmentType: "CONSULTATION_BLOCKED",
          color: "grey",
          releasePolicy: null,
        }),
      ],
      wednesday,
      now,
      opened,
    );
    expect(slots.every((s) => s.status === "BLOCKED")).toBe(true);
    expect(slots.every((s) => s.releaseAt === null)).toBe(true);
  });

  it("password-only PENTA slots stay locked even on an opened day", () => {
    // 2027-02-24 is a Wednesday after the Feb 2027 cutover.
    const [s] = expandTemplateRules(
      [
        rule({
          startTime: "13:30",
          endTime: "13:50",
          slotDurationMinutes: 20,
          appointmentType: "ECHO",
          color: "blue",
        }),
      ],
      dateOnly("2027-02-24"),
      now,
      opened,
    );
    expect(s.status).toBe("LOCKED");
    expect(s.releaseAt).toBeNull();
    expect(s.color).toBe("yellow");
  });
});

describe("isManuallyOpenedDay", () => {
  it("is true only for a Wednesday / last Friday that a user opened", () => {
    expect(
      isManuallyOpenedDay({ dayType: "MANUAL_WEDNESDAY", openedByUserId: "u1" }),
    ).toBe(true);
    expect(isManuallyOpenedDay({ dayType: "LAST_FRIDAY", openedByUserId: "u1" })).toBe(
      true,
    );
    // Generated, not opened by anyone → normal release windows.
    expect(
      isManuallyOpenedDay({ dayType: "MANUAL_WEDNESDAY", openedByUserId: null }),
    ).toBe(false);
    // A holiday Thursday opened by hand keeps its windows.
    expect(
      isManuallyOpenedDay({ dayType: "REGULAR_THURSDAY", openedByUserId: "u1" }),
    ).toBe(false);
  });
});

describe("diffDaySlots", () => {
  const at = (iso: string) => new Date(iso);
  const desiredAt = (startAt: Date): DesiredSlot => ({
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    appointmentType: "DISPENSARY",
    status: "AVAILABLE",
    releaseAt: new Date(0),
    color: "white",
    ruleId: "r",
  });
  // Defaults mirror desiredAt, so a matched slot is "unchanged" unless a test
  // overrides an attribute.
  const existingAt = (
    id: string,
    startAt: Date,
    p: Partial<ExistingSlot> = {},
  ): ExistingSlot => ({
    id,
    startAt,
    hasActiveAppointment: false,
    manualLock: false,
    typeOverride: false,
    appointmentType: "DISPENSARY",
    status: "AVAILABLE",
    releaseAt: new Date(0),
    color: "white",
    ...p,
  });

  it("adds slots present in the template but missing from the day", () => {
    const desired = [desiredAt(at("2026-07-02T05:00:00Z")), desiredAt(at("2026-07-02T07:00:00Z"))];
    const existing = [existingAt("x", at("2026-07-02T07:00:00Z"))];
    const diff = diffDaySlots(desired, existing);
    expect(diff.toCreate.map((s) => s.startAt.toISOString())).toEqual([
      "2026-07-02T05:00:00.000Z",
    ]);
    expect(diff.toDeleteIds).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("removes unbooked slots no longer in the template", () => {
    const desired = [desiredAt(at("2026-07-02T05:00:00Z"))];
    const existing = [
      existingAt("keep", at("2026-07-02T05:00:00Z")),
      existingAt("drop", at("2026-07-02T09:00:00Z")),
    ];
    const diff = diffDaySlots(desired, existing);
    expect(diff.toDeleteIds).toEqual(["drop"]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("never deletes a booked slot, even when dropped from the template", () => {
    const existing = [
      existingAt("booked", at("2026-07-02T09:00:00Z"), {
        status: "BOOKED",
        hasActiveAppointment: true,
      }),
    ];
    const diff = diffDaySlots([], existing);
    expect(diff.toDeleteIds).toEqual([]);
    expect(diff.keptBooked).toBe(1);
  });

  it("leaves an unchanged matched slot untouched", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots([desiredAt(start)], [existingAt("m", start)]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDeleteIds).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.keptBooked).toBe(0);
  });

  it("refreshes a matched unbooked slot whose release rule changed", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots(
      [desiredAt(start)], // now AVAILABLE, releaseAt epoch
      [
        existingAt("m", start, {
          status: "LOCKED",
          releaseAt: at("2026-06-26T06:00:00Z"),
        }),
      ],
    );
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDeleteIds).toEqual([]);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]).toMatchObject({
      id: "m",
      status: "AVAILABLE",
      releaseAt: new Date(0),
    });
  });

  it("refreshes a matched unbooked slot whose type/colour changed", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots(
      [desiredAt(start)], // DISPENSARY / white
      [existingAt("m", start, { appointmentType: "PRE_HOSPITAL", color: "pink" })],
    );
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]).toMatchObject({
      appointmentType: "DISPENSARY",
      color: "white",
    });
  });

  it("never refreshes a booked matched slot", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots(
      [desiredAt(start)],
      [
        existingAt("m", start, {
          status: "BOOKED",
          hasActiveAppointment: true,
          color: "pink",
        }),
      ],
    );
    expect(diff.toUpdate).toEqual([]);
  });

  it("never refreshes a manually-locked matched slot", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots(
      [desiredAt(start)],
      [existingAt("m", start, { manualLock: true, status: "LOCKED", color: "pink" })],
    );
    expect(diff.toUpdate).toEqual([]);
  });

  it("never refreshes a matched slot whose type was changed by hand", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots(
      [desiredAt(start)], // template still says DISPENSARY / white
      [
        existingAt("t", start, {
          typeOverride: true,
          appointmentType: "PRE_HOSPITAL",
          color: "pink",
        }),
      ],
    );
    expect(diff.toUpdate).toEqual([]);
  });

  it("still deletes a re-designated slot dropped from the template", () => {
    // Deliberate parity with manualLock: typeOverride guards the refresh
    // branch, not the delete branch.
    const diff = diffDaySlots(
      [],
      [existingAt("t", at("2026-07-02T05:00:00Z"), { typeOverride: true })],
    );
    expect(diff.toDeleteIds).toEqual(["t"]);
  });

  it("never reopens a BLOCKED (closed-day) matched slot", () => {
    const start = at("2026-07-02T05:00:00Z");
    const diff = diffDaySlots(
      [desiredAt(start)], // would be AVAILABLE
      [existingAt("m", start, { status: "BLOCKED", color: "pink" })],
    );
    expect(diff.toUpdate).toEqual([]);
  });
});

describe("password-only ECHO slots (13:30/13:50/14:10 blocked from Feb 2027)", () => {
  const echo = (startTime: string, endTime: string) =>
    rule({
      startTime,
      endTime,
      slotDurationMinutes: 20,
      appointmentType: "ECHO",
      color: "blue",
    });

  it("before February 2027 an IMMEDIATE 13:30 slot opens right away", () => {
    const [s] = expandTemplateRules([echo("13:30", "13:50")], dateOnly("2027-01-28"), now);
    expect(s.status).toBe("AVAILABLE");
    expect(s.color).toBe("blue");
  });

  it("from 2027-02-01 the 13:30 slot generates LOCKED, no release time, yellow", () => {
    const [s] = expandTemplateRules([echo("13:30", "13:50")], dateOnly("2027-02-04"), now);
    expect(s.status).toBe("LOCKED");
    expect(s.releaseAt).toBeNull();
    expect(s.color).toBe("yellow");
  });

  it("the block trumps the last-Friday override", () => {
    // 2027-02-26 is the last Friday of February 2027.
    const [s] = expandTemplateRules([echo("13:30", "13:50")], dateOnly("2027-02-26"), now);
    expect(s.status).toBe("LOCKED");
    expect(s.releaseAt).toBeNull();
  });

  it("the 14:40 ECHO slot stays immediately bookable after the cutover", () => {
    const [s] = expandTemplateRules([echo("14:40", "15:00")], dateOnly("2027-02-04"), now);
    expect(s.status).toBe("AVAILABLE");
    expect(s.releaseAt).toEqual(new Date(0));
    expect(s.color).toBe("blue");
  });

  it("a template re-apply locks an existing free slot but never a booked one", () => {
    const day = dateOnly("2027-02-04");
    const desired = expandTemplateRules([echo("13:30", "13:50")], day, now);
    const base = {
      startAt: desired[0].startAt,
      manualLock: false,
      typeOverride: false,
      appointmentType: "ECHO" as const,
      releaseAt: new Date(0),
      color: "blue",
    };

    const free = diffDaySlots(desired, [
      { id: "free", hasActiveAppointment: false, status: "AVAILABLE", ...base },
    ]);
    expect(free.toUpdate).toHaveLength(1);
    expect(free.toUpdate[0]).toMatchObject({
      id: "free",
      status: "LOCKED",
      releaseAt: null,
      color: "yellow",
    });

    const booked = diffDaySlots(desired, [
      { id: "booked", hasActiveAppointment: true, status: "BOOKED", ...base },
    ]);
    expect(booked.toUpdate).toEqual([]);
    expect(booked.toDeleteIds).toEqual([]);
  });

  it("a hand-picked designation survives a re-apply, PENTA rule included", () => {
    // isPasswordOnlySlot shapes the DESIRED slot, so the template still wants
    // {ECHO, yellow, LOCKED}. diffDaySlots must skip the row anyway: the PENTA
    // rule trumps every release policy, but not an explicit human decision
    // about a slot that already exists.
    const day = dateOnly("2027-02-04");
    const desired = expandTemplateRules([echo("13:30", "13:50")], day, now);
    expect(desired[0].color).toBe("yellow"); // guard: the rule really did fire

    const diff = diffDaySlots(desired, [
      {
        id: "redesignated",
        startAt: desired[0].startAt,
        hasActiveAppointment: false,
        manualLock: false,
        typeOverride: true,
        appointmentType: "DISPENSARY",
        status: "LOCKED",
        releaseAt: null,
        color: "white",
      },
    ]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDeleteIds).toEqual([]);
  });
});
