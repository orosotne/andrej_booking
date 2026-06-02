import { NextResponse } from "next/server";
import { requireRole, DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { generateDay } from "@/lib/slot-engine/generate";
import { holidayName } from "@/lib/holidays-sk";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { isoDate, openDaySchema } from "@/lib/validation";
import { todayIso } from "@/lib/format";
import { ConflictError, ValidationError } from "@/lib/errors";
import {
  dateOnly,
  isLastFridayOfMonth,
  weekdaysInMonth,
  WEEKDAY,
  isPastIsoDate,
} from "@/lib/calendar-date";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    const user = await requireRole(DOCTOR_ADMIN);
    const { date } = await ctx.params;
    isoDate.parse(date);
    if (isPastIsoDate(date, todayIso())) {
      throw new ValidationError("Nemožno otvoriť deň v minulosti.");
    }
    const body = openDaySchema.parse(await req.json().catch(() => ({})));
    const target = dateOnly(date);
    const isWednesday = target.getUTCDay() === WEEKDAY.WED;
    const isLastFri =
      target.getUTCDay() === WEEKDAY.FRI && isLastFridayOfMonth(target);
    const isHoliday = holidayName(date) !== null;

    // Password gate: streda + posledný piatok v mesiaci + sviatok.
    if (isWednesday || isLastFri || isHoliday) {
      assertUnlockPassword(
        body.password,
        "Nesprávne heslo na otvorenie tohto dňa.",
      );
    }

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
      dayType: isWednesday
        ? "MANUAL_WEDNESDAY"
        : isLastFri
          ? "LAST_FRIDAY"
          : undefined,
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
