import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { closeRangeSchema } from "@/lib/validation";
import { dateOnly } from "@/lib/calendar-date";

/**
 * Closes every existing calendar day in [from, to] in one step (vacation).
 * Password-gated like a single-day close. Only AVAILABLE/LOCKED slots are
 * blocked, so existing appointments are preserved. Ungenerated working days in
 * the range are already non-bookable and are left untouched.
 */
export const POST = defineRoute(
  { roles: ALL_STAFF, body: closeRangeSchema },
  // Closures (vacation / non-working days) may be managed by any staff member
  // — incl. nurses — and stay gated by the shared unlock password below.
  async ({ body, audit }) => {
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

    // Slots blocked + days closed + audit, all atomic: the audit entry can no
    // longer be lost if the process dies after the status update (the audit
    // trail is a compliance requirement, so the write must share the tx).
    await prisma.$transaction(async (tx) => {
      if (ids.length > 0) {
        await tx.appointmentSlot.updateMany({
          where: { calendarDayId: { in: ids }, status: { in: ["AVAILABLE", "LOCKED"] } },
          data: { status: "BLOCKED" },
        });
        await tx.calendarDay.updateMany({
          where: { id: { in: ids }, status: { not: "CLOSED" } },
          data: { status: "CLOSED" },
        });
      }
      await recordAudit(tx, {
        entityType: "calendar_day_range",
        entityId: `${body.from}_${body.to}`,
        action: "close_range",
        reason: body.reason ?? null,
        ctx: audit,
      });
    });

    return NextResponse.json({ ok: true, closed });
  },
);
