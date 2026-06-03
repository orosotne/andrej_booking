import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { patientUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(ALL_STAFF);
    const { id } = await ctx.params;

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
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;
    const data = patientUpdateSchema.parse(await req.json());

    const before = await prisma.patient.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Pacient neexistuje.");

    // Identity fields (name, surname, birth year, phone) are immutable once the
    // patient exists — ignore them here even if a request includes them. Only
    // the national ID, date of birth, email, external ID and note can change.
    const patient = await prisma.patient.update({
      where: { id },
      data: {
        nationalId:
          data.nationalId === undefined ? undefined : data.nationalId || null,
        dateOfBirth:
          data.dateOfBirth === undefined
            ? undefined
            : data.dateOfBirth
              ? new Date(data.dateOfBirth)
              : null,
        email: data.email,
        externalPatientId: data.externalPatientId,
        note: data.note,
      },
    });
    await recordAudit(prisma, {
      entityType: "patient",
      entityId: id,
      action: "update",
      before,
      after: patient,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ patient });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;

    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundError("Pacient neexistuje.");

    // A patient linked to appointments is part of the medical history and must
    // not be hard-deleted (the DB foreign key would also block it). Only
    // appointment-free records (e.g. test/duplicate entries) can be removed.
    const appointments = await prisma.appointment.count({ where: { patientId: id } });
    if (appointments > 0) {
      throw new ValidationError(
        "Pacienta nemožno zmazať — má naviazané objednávky. Zmazať sa dá len pacient bez objednávok.",
      );
    }

    await prisma.patient.delete({ where: { id } });
    await recordAudit(prisma, {
      entityType: "patient",
      entityId: id,
      action: "delete",
      before: patient,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
