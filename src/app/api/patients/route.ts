import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { patientCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";

export const GET = defineRoute({ roles: ALL_STAFF }, async ({ req }) => {
  const q = new URL(req.url).searchParams.get("search")?.trim() ?? "";
  const patients = await prisma.patient.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { externalPatientId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
    // Nearest still-scheduled future appointment per patient — same definition
    // as the patient detail's "upcoming". Lets the list show booked-or-not.
    include: {
      appointments: {
        where: { status: "SCHEDULED", slot: { startAt: { gte: new Date() } } },
        orderBy: { slot: { startAt: "asc" } },
        take: 1,
        select: {
          slot: { select: { calendarDay: { select: { date: true } } } },
        },
      },
    },
  });
  return NextResponse.json({
    patients: patients.map(({ appointments, ...rest }) => ({
      ...rest,
      nextAppointmentDate:
        appointments[0]?.slot.calendarDay.date.toISOString().slice(0, 10) ??
        null,
    })),
  });
});

export const POST = defineRoute(
  { roles: ALL_STAFF, body: patientCreateSchema },
  async ({ body, audit }) => {
    const patient = await prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          birthYear: body.birthYear,
          nationalId: body.nationalId || null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          phone: body.phone || null,
          email: body.email || null,
          externalPatientId: body.externalPatientId || null,
          note: body.note || null,
        },
      });
      await recordAudit(tx, {
        entityType: "patient",
        entityId: created.id,
        action: "create",
        after: created,
        ctx: audit,
      });
      return created;
    });
    return NextResponse.json({ patient }, { status: 201 });
  },
);
