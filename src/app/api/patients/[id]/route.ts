import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { patientUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError, ValidationError } from "@/lib/errors";

export const GET = defineRoute({ roles: ALL_STAFF }, async ({ params }) => {
  const { id } = params;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new NotFoundError("Pacient neexistuje.");

  // The next still-scheduled appointment from now on — used by the patient
  // detail view to show where the patient is booked. Past, cancelled,
  // rescheduled or no-show appointments are not "upcoming".
  const upcoming = await prisma.appointment.findFirst({
    where: {
      patientId: id,
      status: "SCHEDULED",
      slot: { startAt: { gte: new Date() } },
    },
    orderBy: { slot: { startAt: "asc" } },
    include: {
      slot: {
        select: {
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
    upcoming: upcoming
      ? {
          id: upcoming.id,
          startAt: upcoming.slot.startAt.toISOString(),
          endAt: upcoming.slot.endAt.toISOString(),
          appointmentType: upcoming.slot.appointmentType,
          date: upcoming.slot.calendarDay.date.toISOString().slice(0, 10),
        }
      : null,
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

      // Identity fields (name, surname, birth year, phone) are immutable once the
      // patient exists — ignore them here even if a request includes them. Only
      // the national ID, date of birth, email, external ID and note can change.
      const updated = await tx.patient.update({
        where: { id },
        data: {
          nationalId:
            body.nationalId === undefined ? undefined : body.nationalId || null,
          dateOfBirth:
            body.dateOfBirth === undefined
              ? undefined
              : body.dateOfBirth
                ? new Date(body.dateOfBirth)
                : null,
          email: body.email,
          externalPatientId: body.externalPatientId,
          note: body.note,
        },
      });
      await recordAudit(tx, {
        entityType: "patient",
        entityId: id,
        action: "update",
        before,
        after: updated,
        ctx: audit,
      });
      return updated;
    });
    return NextResponse.json({ patient });
  },
);

export const DELETE = defineRoute({ roles: ALL_STAFF }, async ({ params, audit }) => {
  const { id } = params;

  await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundError("Pacient neexistuje.");

    // A patient linked to appointments is part of the medical history and must
    // not be hard-deleted (the DB foreign key would also block it). Only
    // appointment-free records (e.g. test/duplicate entries) can be removed.
    const appointments = await tx.appointment.count({ where: { patientId: id } });
    if (appointments > 0) {
      throw new ValidationError(
        "Pacienta nemožno zmazať — má naviazané objednávky. Zmazať sa dá len pacient bez objednávok.",
      );
    }

    await tx.patient.delete({ where: { id } });
    await recordAudit(tx, {
      entityType: "patient",
      entityId: id,
      action: "delete",
      before: patient,
      ctx: audit,
    });
  });
  return NextResponse.json({ ok: true });
});
