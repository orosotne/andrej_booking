import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { dateOnly } from "@/lib/calendar-date";
import { isoDate } from "@/lib/validation";

// Removes a calendar day and its slots (cascade). Used to undo a manually
// opened day. Refuses if the day has any appointment history — those days
// should be blocked via /close instead, not deleted.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    const user = await requireRole(DOCTOR_ADMIN);
    const { date } = await ctx.params;
    isoDate.parse(date);
    const target = dateOnly(date);

    const day = await prisma.calendarDay.findUnique({ where: { date: target } });
    if (!day) throw new NotFoundError("Deň neexistuje.");

    const appointmentCount = await prisma.appointment.count({
      where: { slot: { calendarDayId: day.id } },
    });
    if (appointmentCount > 0) {
      throw new ConflictError(
        "Deň obsahuje objednávky — nedá sa zrušiť. Najprv zrušte alebo presuňte objednávky.",
      );
    }

    await prisma.calendarDay.delete({ where: { id: day.id } });
    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "delete",
      before: { date, dayType: day.dayType },
      ctx: auditContext(req, user.id),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
