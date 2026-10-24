import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { patientUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditPatientSnapshot } from "@/lib/audit/patient-snapshot";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";
import { deletePatient } from "@/lib/booking/booking-service";
import type { Prisma } from "@/generated/prisma/client";

// Longest stretch of past termíny listed in the patient detail; the attendance
// totals beside it always count the whole history.
const HISTORY_LIMIT = 50;

export const GET = defineRoute({ roles: ALL_STAFF }, async ({ params }) => {
  const { id } = params;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new NotFoundError("Pacient neexistuje.");

  // One instant for every query below, so a still-scheduled appointment is
  // either upcoming or history, never both.
  const now = new Date();

  // All still-scheduled appointments from now on — the patient detail lists each
  // one (with a cancel action) and lets staff book further visits. Past,
  // cancelled, rescheduled or no-show appointments are not "upcoming".
  const upcomingList = await prisma.appointment.findMany({
    where: {
      patientId: id,
      status: "SCHEDULED",
      slot: { startAt: { gte: now } },
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
      slot: { startAt: { lt: now } },
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

  // História termínov: every past termín with its attendance, newest first.
  // Marked ones (Prišiel / Vybavený / Neprišiel) count whenever they fall; a
  // still-SCHEDULED one only once its slot has passed, as "neoznačené".
  // Cancelled and moved appointments never took place and stay out.
  const historyWhere: Prisma.AppointmentWhereInput = {
    patientId: id,
    OR: [
      { status: { in: ["ARRIVED", "COMPLETED", "NO_SHOW"] } },
      { status: "SCHEDULED", slot: { startAt: { lt: now } } },
    ],
  };
  const [history, historyCounts] = await Promise.all([
    prisma.appointment.findMany({
      where: historyWhere,
      orderBy: { slot: { startAt: "desc" } },
      take: HISTORY_LIMIT,
      include: {
        slot: {
          select: {
            startAt: true,
            appointmentType: true,
            calendarDay: { select: { date: true } },
          },
        },
      },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: historyWhere,
      _count: { _all: true },
    }),
  ]);
  const countOf = (status: string) =>
    historyCounts.find((c) => c.status === status)?._count._all ?? 0;

  return NextResponse.json({
    patient,
    upcomingList: upcomingList.map((a) => ({
      id: a.id,
      slotId: a.slot.id,
      startAt: a.slot.startAt.toISOString(),
      endAt: a.slot.endAt.toISOString(),
      appointmentType: a.slot.appointmentType,
      date: a.slot.calendarDay.date.toISOString().slice(0, 10),
      createdAt: a.createdAt.toISOString(),
      patientCategory: a.patientCategory,
    })),
    lastVisit: lastVisit
      ? {
          date: lastVisit.slot.calendarDay.date.toISOString().slice(0, 10),
          appointmentType: lastVisit.slot.appointmentType,
        }
      : null,
    history: history.map((a) => ({
      id: a.id,
      startAt: a.slot.startAt.toISOString(),
      appointmentType: a.slot.appointmentType,
      date: a.slot.calendarDay.date.toISOString().slice(0, 10),
      status: a.status,
    })),
    attendance: {
      arrived: countOf("ARRIVED") + countOf("COMPLETED"),
      noShow: countOf("NO_SHOW"),
      unmarked: countOf("SCHEDULED"),
    },
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
