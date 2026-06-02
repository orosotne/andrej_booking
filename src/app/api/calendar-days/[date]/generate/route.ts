import { NextResponse } from "next/server";
import { requireRole, DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { generateDay } from "@/lib/slot-engine/generate";
import { auditContext, jsonError } from "@/lib/api";
import { recordAudit } from "@/lib/audit/audit";
import { prisma } from "@/lib/db";
import { isPastIsoDate } from "@/lib/calendar-date";
import { todayIso } from "@/lib/format";
import { isoDate } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    const user = await requireRole(DOCTOR_ADMIN);
    const { date } = await ctx.params;
    isoDate.parse(date);
    if (isPastIsoDate(date, todayIso())) {
      throw new ValidationError("Nemožno generovať deň v minulosti.");
    }
    const day = await generateDay(date);
    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "generate",
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ day });
  } catch (e) {
    return jsonError(e);
  }
}
