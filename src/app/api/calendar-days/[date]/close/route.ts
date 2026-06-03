import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { dateOnly } from "@/lib/calendar-date";
import { isoDate, closeDaySchema } from "@/lib/validation";

// Closing a day (vacation / non-working) is allowed for any staff member, incl.
// nurses; still gated by the shared unlock password below.
export const POST = defineRoute(
  { roles: ALL_STAFF, body: closeDaySchema },
  async ({ params, body, audit }) => {
    isoDate.parse(params.date);
    // Zatvorenie celého dňa je chránené heslom.
    assertUnlockPassword(body.password, "Nesprávne heslo na zatvorenie dňa.");
    const target = dateOnly(params.date);

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

    // Slots blocked + day closed + audit, all atomic: the audit entry can no
    // longer be lost if the process dies after the status update (the audit
    // trail is a compliance requirement, so the write must share the tx).
    await prisma.$transaction(async (tx) => {
      await tx.appointmentSlot.updateMany({
        where: { calendarDayId: day.id, status: { in: ["AVAILABLE", "LOCKED"] } },
        data: { status: "BLOCKED" },
      });
      await tx.calendarDay.update({
        where: { id: day.id },
        data: { status: "CLOSED" },
      });
      await recordAudit(tx, {
        entityType: "calendar_day",
        entityId: day.id,
        action: "close",
        reason: body.reason ?? null,
        ctx: audit,
      });
    });

    return NextResponse.json({ ok: true });
  },
);
