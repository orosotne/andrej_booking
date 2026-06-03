import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  bookSlot,
  cancelAppointment,
  updateAppointment,
  deletePatient,
} from "@/lib/booking/booking-service";
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
});
