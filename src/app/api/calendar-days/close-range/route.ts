import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { closeRangeSchema } from "@/lib/validation";
import { dateOnly } from "@/lib/calendar-date";

/**
 * Closes every existing calendar day in [from, to] in one step (vacation).
 * Password-gated like a single-day close. Only AVAILABLE/LOCKED slots are
 * blocked, so existing appointments are preserved. Ungenerated working days in
 * the range are already non-bookable and are left untouched.
 */
export async function POST(req: Request) {
  try {
    // Closures (vacation / non-working days) may be managed by any staff member
    // — incl. nurses — and stay gated by the shared unlock password below.
    const user = await requireRole(ALL_STAFF);
    const body = closeRangeSchema.parse(await req.json().catch(() => ({})));
    assertUnlockPassword(
      body.password,
      "Nesprávne heslo na zatvorenie rozsahu dní.",
    );

    const gte = dateOnly(body.from);
    const lte = dateOnly(body.to);
    const days = await prisma.calendarDay.findMany({
      where: { date: { gte, lte } },
      select: { id: true, status: true },
    });
    const ids = days.map((d) => d.id);
    const closed = days.filter((d) => d.status !== "CLOSED").length;

    if (ids.length > 0) {
      await prisma.$transaction([
        prisma.appointmentSlot.updateMany({
          where: { calendarDayId: { in: ids }, status: { in: ["AVAILABLE", "LOCKED"] } },
          data: { status: "BLOCKED" },
        }),
        prisma.calendarDay.updateMany({
          where: { id: { in: ids }, status: { not: "CLOSED" } },
          data: { status: "CLOSED" },
        }),
      ]);
    }

    await recordAudit(prisma, {
      entityType: "calendar_day_range",
      entityId: `${body.from}_${body.to}`,
      action: "close_range",
      reason: body.reason ?? null,
      ctx: auditContext(req, user.id),
    });

    return NextResponse.json({ ok: true, closed });
  } catch (e) {
    return jsonError(e);
  }
}
