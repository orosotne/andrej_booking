import { NextResponse } from "next/server";
import { requireRole, DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { dateOnly } from "@/lib/calendar-date";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    const user = await requireRole(DOCTOR_ADMIN);
    const { date } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      reason?: string;
    };
    const target = dateOnly(date);

    const day = await prisma.calendarDay.findUnique({
      where: { date: target },
      include: {
        slots: {
          include: {
            appointments: { where: { status: { in: ["SCHEDULED", "ARRIVED"] } } },
          },
        },
      },
    });
    if (!day) throw new NotFoundError("Deň neexistuje.");

    const hasAppointments = day.slots.some((s) => s.appointments.length > 0);
    if (hasAppointments && !body.force) {
      throw new ConflictError(
        "Deň obsahuje aktívne objednávky. Zatvorenie vyžaduje potvrdenie (force=true).",
      );
    }

    await prisma.$transaction([
      prisma.appointmentSlot.updateMany({
        where: { calendarDayId: day.id, status: { in: ["AVAILABLE", "LOCKED"] } },
        data: { status: "BLOCKED" },
      }),
      prisma.calendarDay.update({
        where: { id: day.id },
        data: { status: "CLOSED" },
      }),
    ]);

    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "close",
      reason: body.reason ?? null,
      ctx: auditContext(req, user.id),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
