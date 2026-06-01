import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  bookSlot,
  cancelAppointment,
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
});
