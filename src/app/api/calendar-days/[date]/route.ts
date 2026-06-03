import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { dateOnly } from "@/lib/calendar-date";
import { isoDate } from "@/lib/validation";
import { AppointmentStatus } from "@/generated/prisma/enums";

// Statuses representing real, irreversible state (active commitments or completed
// medical records). Anything else (CANCELLED, NO_SHOW, RESCHEDULED) is scheduling
// noise — those rows are cleaned up alongside the day so phantom history can't
// permanently block deletion.
const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.COMPLETED,
];

// Removes a calendar day and its slots (cascade). Used to undo a manually
// opened day. Refuses if any active/completed appointment exists — those days
// should be blocked via /close instead, not deleted.
export const DELETE = defineRoute(
  { roles: DOCTOR_ADMIN },
  async ({ params, audit }) => {
    const { date } = params;
    isoDate.parse(date);
    const target = dateOnly(date);

    const day = await prisma.calendarDay.findUnique({ where: { date: target } });
    if (!day) throw new NotFoundError("Deň neexistuje.");

    const blockingCount = await prisma.appointment.count({
      where: {
        slot: { calendarDayId: day.id },
        status: { in: BLOCKING_STATUSES },
      },
    });
    if (blockingCount > 0) {
      throw new ConflictError(
        "Deň obsahuje aktívne alebo dokončené objednávky — nedá sa zrušiť. Najprv zrušte alebo presuňte objednávky.",
      );
    }

    await prisma.$transaction(async (tx) => {
      const purged = await tx.appointment.deleteMany({
        where: { slot: { calendarDayId: day.id } },
      });
      await tx.calendarDay.delete({ where: { id: day.id } });
      await recordAudit(tx, {
        entityType: "calendar_day",
        entityId: day.id,
        action: "delete",
        before: { date, dayType: day.dayType, purgedAppointments: purged.count },
        ctx: audit,
      });
    });

    return NextResponse.json({ ok: true });
  },
);
