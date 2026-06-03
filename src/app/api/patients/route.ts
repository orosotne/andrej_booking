import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { patientCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    await requireRole(ALL_STAFF);
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
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(ALL_STAFF);
    const data = patientCreateSchema.parse(await req.json());
    const patient = await prisma.patient.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        birthYear: data.birthYear,
        nationalId: data.nationalId || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        phone: data.phone || null,
        email: data.email || null,
        externalPatientId: data.externalPatientId || null,
        note: data.note || null,
      },
    });
    await recordAudit(prisma, {
      entityType: "patient",
      entityId: patient.id,
      action: "create",
      after: patient,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ patient }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
