import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { ValidationError } from "@/lib/errors";
import { closeRangeSchema } from "@/lib/validation";
import { dateOnly } from "@/lib/calendar-date";

// "2026-06-04" → "4. 6." for a compact, Slovak-readable conflict list.
function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

/**
 * Closes every existing calendar day in [from, to] in one step (vacation).
 * Password-gated like a single-day close. Refuses if any day in the range still
 * holds a booked appointment — those must be rescheduled first, so a vacation is
 * never silently laid over existing patients. Only AVAILABLE/LOCKED slots are
 * blocked once the range is clear; ungenerated working days are left untouched.
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

    // Protection: never close over booked appointments. The doctor must move
    // those patients elsewhere first; only then can the vacation be applied.
    if (ids.length > 0) {
      const booked = await prisma.appointmentSlot.findMany({
        where: { calendarDayId: { in: ids }, status: "BOOKED" },
        select: { calendarDay: { select: { date: true } } },
        orderBy: { startAt: "asc" },
      });
      if (booked.length > 0) {
        const dates = [
          ...new Set(
            booked.map((b) => b.calendarDay.date.toISOString().slice(0, 10)),
          ),
        ];
        const shown = dates.slice(0, 8).map(shortDay).join(", ");
        const more = dates.length > 8 ? ` a ďalšie` : "";
        throw new ValidationError(
          `V rozsahu sú objednaní pacienti (${booked.length}) v dňoch: ${shown}${more}. ` +
            `Najprv ich presuňte na iný termín, až potom sa dá dovolenka zatvoriť.`,
        );
      }
    }

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
