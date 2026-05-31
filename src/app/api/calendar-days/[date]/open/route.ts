import { NextResponse } from "next/server";
import { requireRole, DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { generateDay } from "@/lib/slot-engine/generate";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { openDaySchema } from "@/lib/validation";
import { ConflictError } from "@/lib/errors";
import { dateOnly, weekdaysInMonth, WEEKDAY } from "@/lib/calendar-date";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    const user = await requireRole(DOCTOR_ADMIN);
    const { date } = await ctx.params;
    const body = openDaySchema.parse(await req.json().catch(() => ({})));
    const target = dateOnly(date);
    const isWednesday = target.getUTCDay() === WEEKDAY.WED;

    // Warn if another Wednesday in the same month is already open this month.
    if (isWednesday) {
      const monthWeds = weekdaysInMonth(target, WEEKDAY.WED);
      const alreadyOpen = await prisma.calendarDay.findFirst({
        where: {
          date: { in: monthWeds, not: target },
          dayType: "MANUAL_WEDNESDAY",
          status: { in: ["OPEN", "GENERATED", "PARTIALLY_LOCKED"] },
        },
      });
      if (alreadyOpen && !body.overrideReason) {
        throw new ConflictError(
          "V tomto mesiaci je už otvorená iná streda. Pre výnimku uveďte dôvod (overrideReason).",
        );
      }
    }

    const day = await generateDay(target, {
      dayType: isWednesday ? "MANUAL_WEDNESDAY" : undefined,
      openedByUserId: user.id,
      note: body.note,
    });

    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "open",
      after: { date, dayType: day.dayType },
      reason: body.overrideReason ?? null,
      ctx: auditContext(req, user.id),
    });

    return NextResponse.json({ day });
  } catch (e) {
    return jsonError(e);
  }
}
