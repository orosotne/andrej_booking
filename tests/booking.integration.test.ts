import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  bookSlot,
  cancelAppointment,
  updateAppointment,
  deletePatient,
  lockSlot,
  unlockSlot,
  changeSlotDesignation,
} from "@/lib/booking/booking-service";
import { releaseDueSlots } from "@/lib/slot-engine/release";
import { ConflictError, ValidationError } from "@/lib/errors";

// Requires a REAL (throwaway/test) Postgres. Run with:
//   RUN_DB_TESTS=1 DATABASE_URL=postgres://... npm test
// Skipped by default so `npm test` stays green without a database.
const RUN = Boolean(process.env.RUN_DB_TESTS);

const ctx = { actorUserId: null };

describe.skipIf(!RUN)("booking integration (requires DB)", () => {
  let slotId = "";
  let patientId = "";
  let dayId = "";

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS active_appointment_per_slot
         ON appointments (slot_id) WHERE status NOT IN ('CANCELLED','RESCHEDULED')`,
    );
    const patient = await prisma.patient.create({
      data: { firstName: "Test", lastName: "Pacient" },
    });
    patientId = patient.id;
    const day = await prisma.calendarDay.create({
      data: { date: new Date("2099-12-31"), dayType: "REGULAR_FRIDAY", status: "OPEN" },
    });
    dayId = day.id;
    const slot = await prisma.appointmentSlot.create({
      data: {
        calendarDayId: day.id,
        startAt: new Date("2099-12-31T07:00:00.000Z"),
        endAt: new Date("2099-12-31T07:30:00.000Z"),
        appointmentType: "DISPENSARY",
        status: "AVAILABLE",
        releaseAt: new Date("2000-01-01T00:00:00.000Z"),
        color: "white",
      },
    });
    slotId = slot.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { slotId } });
    await prisma.appointmentSlot.deleteMany({ where: { calendarDayId: dayId } });
    await prisma.calendarDay.deleteMany({ where: { id: dayId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("allows exactly one of two concurrent bookings on the same slot", async () => {
    const results = await Promise.allSettled([
      bookSlot({ slotId, patientId, appointmentType: "DISPENSARY", patientCategory: "DISPENZAR", ctx }),
      bookSlot({ slotId, patientId, appointmentType: "DISPENSARY", patientCategory: "DISPENZAR", ctx }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it("rejects a booking whose type does not match the slot", async () => {
    const active = await prisma.appointment.findFirst({
      where: { slotId, status: "SCHEDULED" },
    });
    if (active) {
      await cancelAppointment({ appointmentId: active.id, reason: "test", ctx });
    }
    await expect(
      bookSlot({
        slotId,
        patientId,
        appointmentType: "ECHO",
        patientCategory: "ECHO",
        ctx,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // slot must be AVAILABLE again after the rolled-back wrong-type attempt
    const slot = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slotId } });
    expect(slot.status).toBe("AVAILABLE");
  });

  // Regression: a NO_SHOW keeps its slot BOOKED. Deleting that patient purges the
  // no-show row, which must RELEASE the slot — otherwise it stays orphaned BOOKED
  // (phantom, unbookable capacity). Self-contained (own patient + slot) so it
  // doesn't disturb the shared fixtures.
  it("releases a no-show's slot when its patient is deleted", async () => {
    const p = await prisma.patient.create({
      data: { firstName: "Del", lastName: "Test" },
    });
    const slot = await prisma.appointmentSlot.create({
      data: {
        calendarDayId: dayId,
        startAt: new Date("2099-12-31T09:00:00.000Z"),
        endAt: new Date("2099-12-31T09:30:00.000Z"),
        appointmentType: "DISPENSARY",
        status: "AVAILABLE",
        releaseAt: new Date("2000-01-01T00:00:00.000Z"),
        color: "white",
      },
    });
    try {
      const appt = await bookSlot({
        slotId: slot.id,
        patientId: p.id,
        appointmentType: "DISPENSARY",
        patientCategory: "DISPENZAR",
        ctx,
      });
      await updateAppointment({ appointmentId: appt.id, status: "NO_SHOW", ctx });

      // Precondition: a no-show still occupies its slot.
      expect(
        (await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } }))
          .status,
      ).toBe("BOOKED");

      const result = await deletePatient({ patientId: p.id, ctx });
      expect(result).toEqual({ purged: 1, freedSlots: 1 });

      // Patient + appointment are gone, and the slot is released (releaseAt is in
      // the past → AVAILABLE), not left orphaned as BOOKED.
      expect(await prisma.patient.findUnique({ where: { id: p.id } })).toBeNull();
      expect(await prisma.appointment.findUnique({ where: { id: appt.id } })).toBeNull();
      expect(
        (await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } }))
          .status,
      ).toBe("AVAILABLE");
    } finally {
      await prisma.appointment.deleteMany({ where: { slotId: slot.id } });
      await prisma.appointmentSlot.deleteMany({ where: { id: slot.id } });
      await prisma.patient.deleteMany({ where: { id: p.id } });
    }
  });

  // Manual-lock modes: without `until` the lock survives the release cron
  // (release_at = null); with `until` the cron opens the slot that morning.
  it("locks until password unlock: release cron never reopens it", async () => {
    const slot = await prisma.appointmentSlot.create({
      data: {
        calendarDayId: dayId,
        startAt: new Date("2099-12-31T10:00:00.000Z"),
        endAt: new Date("2099-12-31T10:30:00.000Z"),
        appointmentType: "DISPENSARY",
        status: "AVAILABLE",
        releaseAt: new Date("2000-01-01T00:00:00.000Z"),
        color: "white",
      },
    });
    try {
      const locked = await lockSlot({ slotId: slot.id, reason: "test", ctx });
      expect(locked.status).toBe("LOCKED");
      expect(locked.manualLock).toBe(true);
      expect(locked.releaseAt).toBeNull();

      await releaseDueSlots();
      const after = await prisma.appointmentSlot.findUniqueOrThrow({
        where: { id: slot.id },
      });
      expect(after.status).toBe("LOCKED");
    } finally {
      await prisma.appointmentSlot.deleteMany({ where: { id: slot.id } });
    }
  });

  it("locks until a date: stamps 06:00 UTC and the cron auto-unlocks", async () => {
    const slot = await prisma.appointmentSlot.create({
      data: {
        calendarDayId: dayId,
        startAt: new Date("2099-12-31T10:30:00.000Z"),
        endAt: new Date("2099-12-31T11:00:00.000Z"),
        appointmentType: "DISPENSARY",
        status: "AVAILABLE",
        releaseAt: new Date("2000-01-01T00:00:00.000Z"),
        color: "white",
      },
    });
    try {
      const locked = await lockSlot({
        slotId: slot.id,
        until: new Date("2099-12-30T00:00:00.000Z"),
        ctx,
      });
      expect(locked.status).toBe("LOCKED");
      expect(locked.releaseAt?.toISOString()).toBe("2099-12-30T06:00:00.000Z");

      // Before the date: the cron leaves it locked.
      await releaseDueSlots(new Date("2099-12-29T07:00:00.000Z"));
      expect(
        (await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } }))
          .status,
      ).toBe("LOCKED");

      // The morning it arrives: opened, manual-lock marker cleared.
      await releaseDueSlots(new Date("2099-12-30T07:00:00.000Z"));
      const after = await prisma.appointmentSlot.findUniqueOrThrow({
        where: { id: slot.id },
      });
      expect(after.status).toBe("AVAILABLE");
      expect(after.manualLock).toBe(false);
      expect(after.lockedReason).toBeNull();
    } finally {
      await prisma.appointmentSlot.deleteMany({ where: { id: slot.id } });
    }
  });

  it("rejects an auto-unlock date in the past or after the slot's day", async () => {
    const slot = await prisma.appointmentSlot.create({
      data: {
        calendarDayId: dayId,
        startAt: new Date("2099-12-31T11:00:00.000Z"),
        endAt: new Date("2099-12-31T11:30:00.000Z"),
        appointmentType: "DISPENSARY",
        status: "AVAILABLE",
        releaseAt: new Date("2000-01-01T00:00:00.000Z"),
        color: "white",
      },
    });
    try {
      await expect(
        lockSlot({ slotId: slot.id, until: new Date("2000-01-02T00:00:00.000Z"), ctx }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        lockSlot({ slotId: slot.id, until: new Date("2100-01-01T00:00:00.000Z"), ctx }),
      ).rejects.toBeInstanceOf(ValidationError);
      // Both rejections happen before any write: the slot is still AVAILABLE.
      expect(
        (await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } }))
          .status,
      ).toBe("AVAILABLE");
    } finally {
      await prisma.appointmentSlot.deleteMany({ where: { id: slot.id } });
    }
  });
});

describe.skipIf(!RUN)("changeSlotDesignation (requires DB)", () => {
  let dayId = "";
  let closedDayId = "";
  let pastDayId = "";
  let patientId = "";

  // Each test gets its own slot so ordering never matters.
  async function mkSlot(
    p: {
      dayId?: string;
      minute?: number;
      type?: "DISPENSARY" | "ECHO" | "CONSULTATION_BLOCKED";
      status?: "AVAILABLE" | "LOCKED" | "BLOCKED" | "BOOKED";
      releaseAt?: Date | null;
      color?: string;
    } = {},
  ) {
    const minute = p.minute ?? Math.floor(Math.random() * 100000);
    const day = p.dayId ?? dayId;
    const start = new Date(2099, 0, 1);
    start.setUTCFullYear(2099, 0, 1);
    start.setUTCHours(7, 0, 0, 0);
    start.setUTCMinutes(minute);
    return prisma.appointmentSlot.create({
      data: {
        calendarDayId: day,
        startAt: start,
        endAt: new Date(start.getTime() + 20 * 60_000),
        appointmentType: p.type ?? "DISPENSARY",
        status: p.status ?? "AVAILABLE",
        releaseAt: p.releaseAt === undefined ? new Date("2000-01-01T00:00:00.000Z") : p.releaseAt,
        color: p.color ?? "white",
      },
    });
  }

  beforeAll(async () => {
    const p = await prisma.patient.create({
      data: { firstName: "Urcenie", lastName: "Test" },
    });
    patientId = p.id;
    dayId = (
      await prisma.calendarDay.create({
        data: { date: new Date("2099-01-01"), dayType: "REGULAR_FRIDAY", status: "OPEN" },
      })
    ).id;
    closedDayId = (
      await prisma.calendarDay.create({
        data: { date: new Date("2099-01-08"), dayType: "REGULAR_FRIDAY", status: "CLOSED" },
      })
    ).id;
    pastDayId = (
      await prisma.calendarDay.create({
        data: { date: new Date("2000-01-07"), dayType: "REGULAR_FRIDAY", status: "OPEN" },
      })
    ).id;
  });

  afterAll(async () => {
    const days = [dayId, closedDayId, pastDayId];
    const slots = await prisma.appointmentSlot.findMany({
      where: { calendarDayId: { in: days } },
      select: { id: true },
    });
    await prisma.appointment.deleteMany({
      where: { slotId: { in: slots.map((s) => s.id) } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityType: "slot", entityId: { in: slots.map((s) => s.id) } },
    });
    await prisma.appointmentSlot.deleteMany({ where: { calendarDayId: { in: days } } });
    await prisma.calendarDay.deleteMany({ where: { id: { in: days } } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("rewrites type + colour, sets typeOverride and writes an audit row", async () => {
    const slot = await mkSlot({ minute: 1 });
    const out = await changeSlotDesignation({
      slotId: slot.id,
      designation: "ECHO",
      ctx,
    });
    expect(out.appointmentType).toBe("ECHO");
    expect(out.color).toBe("blue");
    expect(out.status).toBe("AVAILABLE");
    expect(out.releaseAt).toEqual(slot.releaseAt); // window untouched
    expect(out.typeOverride).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "slot", entityId: slot.id, action: "change_type" },
    });
    expect(log).not.toBeNull();
  });

  it("keeps a LOCKED slot locked with its original release time", async () => {
    const release = new Date("2099-01-01T06:00:00.000Z");
    const slot = await mkSlot({ minute: 2, status: "LOCKED", releaseAt: release });
    const out = await changeSlotDesignation({
      slotId: slot.id,
      designation: "PRE_HOSPITAL",
      ctx,
    });
    expect(out.status).toBe("LOCKED");
    expect(out.releaseAt).toEqual(release);
  });

  it("forces BLOCKED with no release when switching to porada", async () => {
    const slot = await mkSlot({ minute: 3 });
    const out = await changeSlotDesignation({
      slotId: slot.id,
      designation: "CONSULTATION_BLOCKED",
      ctx,
    });
    expect(out.status).toBe("BLOCKED");
    expect(out.releaseAt).toBeNull();
    expect(out.color).toBe("grey");
  });

  it("brings a blocked slot back as a discoverable manual lock", async () => {
    const slot = await mkSlot({
      minute: 4,
      type: "CONSULTATION_BLOCKED",
      status: "BLOCKED",
      releaseAt: null,
      color: "grey",
    });
    const out = await changeSlotDesignation({
      slotId: slot.id,
      designation: "PRE_HOSPITAL",
      ctx,
    });
    expect(out.status).toBe("LOCKED");
    expect(out.releaseAt).toBeNull();
    // manualLock is what surfaces it in /api/slots/locked.
    expect(out.manualLock).toBe(true);
  });

  it("clears the yellow PENTA colour when moving away from echo penta", async () => {
    const slot = await mkSlot({
      minute: 5,
      type: "ECHO",
      status: "LOCKED",
      releaseAt: null,
      color: "yellow",
    });
    const out = await changeSlotDesignation({
      slotId: slot.id,
      designation: "DISPENSARY",
      ctx,
    });
    expect(out.color).toBe("white");
  });

  it("refuses a booked slot", async () => {
    const slot = await mkSlot({ minute: 6 });
    await bookSlot({
      slotId: slot.id,
      patientId,
      appointmentType: "DISPENSARY",
      patientCategory: "DISPENZAR",
      ctx,
    });
    await expect(
      changeSlotDesignation({ slotId: slot.id, designation: "ECHO", ctx }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a slot whose patient was marked NO_SHOW", async () => {
    // A no-show never frees the slot — it stays BOOKED — so the slot must stay
    // un-redesignable even though NO_SHOW is not a BLOCKING_STATUS.
    const slot = await mkSlot({ minute: 7 });
    const appt = await bookSlot({
      slotId: slot.id,
      patientId,
      appointmentType: "DISPENSARY",
      patientCategory: "DISPENZAR",
      ctx,
    });
    await updateAppointment({ appointmentId: appt.id, status: "NO_SHOW", ctx });
    await expect(
      changeSlotDesignation({ slotId: slot.id, designation: "ECHO", ctx }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a no-op change", async () => {
    const slot = await mkSlot({ minute: 8 });
    await expect(
      changeSlotDesignation({ slotId: slot.id, designation: "DISPENSARY", ctx }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a slot on a closed day", async () => {
    const slot = await mkSlot({ minute: 9, dayId: closedDayId });
    await expect(
      changeSlotDesignation({ slotId: slot.id, designation: "ECHO", ctx }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a slot in the past", async () => {
    const slot = await mkSlot({ minute: 10, dayId: pastDayId });
    await expect(
      changeSlotDesignation({ slotId: slot.id, designation: "ECHO", ctx }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps typeOverride through releaseDueSlots", async () => {
    const slot = await mkSlot({
      minute: 11,
      status: "LOCKED",
      releaseAt: new Date("2000-01-01T06:00:00.000Z"),
    });
    await changeSlotDesignation({ slotId: slot.id, designation: "ECHO", ctx });
    await releaseDueSlots();
    const after = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.status).toBe("AVAILABLE");
    expect(after.typeOverride).toBe(true);
  });

  it("keeps typeOverride through unlockSlot", async () => {
    const slot = await mkSlot({ minute: 12, status: "LOCKED", releaseAt: null });
    await changeSlotDesignation({ slotId: slot.id, designation: "ECHO", ctx });
    await unlockSlot({ slotId: slot.id, ctx });
    const after = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.status).toBe("AVAILABLE");
    expect(after.typeOverride).toBe(true);
  });
});
