import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { dateOnly } from "@/lib/calendar-date";
import { isoDate } from "@/lib/validation";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    // Closing a day (vacation / non-working) is allowed for any staff member,
    // incl. nurses; still gated by the shared unlock password below.
    const user = await requireRole(ALL_STAFF);
    const { date } = await ctx.params;
    isoDate.parse(date);
    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      reason?: string;
      password?: string;
    };
    // Zatvorenie celého dňa je chránené heslom.
    assertUnlockPassword(body.password, "Nesprávne heslo na zatvorenie dňa.");
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
