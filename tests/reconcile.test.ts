import { describe, it, expect } from "vitest";
import {
  expandTemplateRules,
  diffDaySlots,
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
  });

  it("from 2027-02-01 the 13:30 slot generates LOCKED with no release time", () => {
    const [s] = expandTemplateRules([echo("13:30", "13:50")], dateOnly("2027-02-04"), now);
    expect(s.status).toBe("LOCKED");
    expect(s.releaseAt).toBeNull();
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
  });

  it("a template re-apply locks an existing free slot but never a booked one", () => {
    const day = dateOnly("2027-02-04");
    const desired = expandTemplateRules([echo("13:30", "13:50")], day, now);
    const base = {
      startAt: desired[0].startAt,
      manualLock: false,
      appointmentType: "ECHO" as const,
      releaseAt: new Date(0),
      color: "blue",
    };

    const free = diffDaySlots(desired, [
      { id: "free", hasActiveAppointment: false, status: "AVAILABLE", ...base },
    ]);
    expect(free.toUpdate).toHaveLength(1);
    expect(free.toUpdate[0]).toMatchObject({ id: "free", status: "LOCKED", releaseAt: null });

    const booked = diffDaySlots(desired, [
      { id: "booked", hasActiveAppointment: true, status: "BOOKED", ...base },
    ]);
    expect(booked.toUpdate).toEqual([]);
    expect(booked.toDeleteIds).toEqual([]);
  });
});
