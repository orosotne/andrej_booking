import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { patientUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditPatientSnapshot } from "@/lib/audit/patient-snapshot";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";
import { deletePatient } from "@/lib/booking/booking-service";

export const GET = defineRoute({ roles: ALL_STAFF }, async ({ params }) => {
  const { id } = params;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new NotFoundError("Pacient neexistuje.");

  // All still-scheduled appointments from now on — the patient detail lists each
  // one (with a cancel action) and lets staff book further visits. Past,
  // cancelled, rescheduled or no-show appointments are not "upcoming".
  const upcomingList = await prisma.appointment.findMany({
    where: {
      patientId: id,
      status: "SCHEDULED",
      slot: { startAt: { gte: new Date() } },
    },
    orderBy: { slot: { startAt: "asc" } },
    include: {
      slot: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          appointmentType: true,
          calendarDay: { select: { date: true } },
        },
      },
    },
  });

  // The most recent past appointment that counts as an actual visit — shown as
  // "naposledy vyšetrený". Includes still-SCHEDULED past slots (visits that
  // were never marked) and ARRIVED/COMPLETED; excludes NO_SHOW, CANCELLED and
  // RESCHEDULED, which are not visits.
  const lastVisit = await prisma.appointment.findFirst({
    where: {
      patientId: id,
      status: { in: ["SCHEDULED", "ARRIVED", "COMPLETED"] },
      slot: { startAt: { lt: new Date() } },
    },
    orderBy: { slot: { startAt: "desc" } },
    include: {
      slot: {
        select: {
          appointmentType: true,
          calendarDay: { select: { date: true } },
        },
      },
    },
  });

  return NextResponse.json({
    patient,
    upcomingList: upcomingList.map((a) => ({
      id: a.id,
      slotId: a.slot.id,
      startAt: a.slot.startAt.toISOString(),
      endAt: a.slot.endAt.toISOString(),
      appointmentType: a.slot.appointmentType,
      date: a.slot.calendarDay.date.toISOString().slice(0, 10),
    })),
    lastVisit: lastVisit
      ? {
          date: lastVisit.slot.calendarDay.date.toISOString().slice(0, 10),
          appointmentType: lastVisit.slot.appointmentType,
        }
      : null,
  });
});

export const PATCH = defineRoute(
  { roles: ALL_STAFF, body: patientUpdateSchema },
  async ({ params, body, audit }) => {
    const { id } = params;

    const patient = await prisma.$transaction(async (tx) => {
      const before = await tx.patient.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Pacient neexistuje.");

      const updated = await tx.patient.update({
        where: { id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          birthYear: body.birthYear,
          phone: body.phone,
          nationalId:
            body.nationalId === undefined ? undefined : body.nationalId || null,
          dateOfBirth:
            body.dateOfBirth === undefined
              ? undefined
              : body.dateOfBirth
                ? new Date(body.dateOfBirth)
                : null,
          email: body.email === undefined ? undefined : body.email || null,
          externalPatientId: body.externalPatientId,
          note: body.note === undefined ? undefined : body.note || null,
        },
      });
      await recordAudit(tx, {
        entityType: "patient",
        entityId: id,
        action: "update",
        before: auditPatientSnapshot(before),
        after: auditPatientSnapshot(updated),
        ctx: audit,
      });
      return updated;
    });
    return NextResponse.json({ patient });
  },
);

export const DELETE = defineRoute({ roles: ALL_STAFF }, async ({ params, audit }) => {
  await deletePatient({ patientId: params.id, ctx: audit });
  return NextResponse.json({ ok: true });
});
