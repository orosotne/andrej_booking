import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { todayIso } from "@/lib/format";
import { toSlotDTO } from "@/lib/slot-dto";
import type { BookedAppointmentDTO } from "@/lib/api-types";
import type { Prisma, AppointmentStatus } from "@/generated/prisma/client";

// Upcoming view = active bookings still ahead (or today). Past view = full
// history, any status (incl. cancelled / no-show / rescheduled).
const UPCOMING_STATUSES: AppointmentStatus[] = ["SCHEDULED", "ARRIVED"];
const MAX_ROWS = 500;

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  note: true,
} as const;

// Admin "Objednaní ľudia" list: every booked patient in one table, filtered by
// scope (upcoming/past) and an optional name query. Reuses SlotDTO so the rows
// feed AppointmentActions directly (detail / reschedule / cancel).
export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req }) => {
  const url = new URL(req.url);
  const past = url.searchParams.get("scope") === "past";
  const q = (url.searchParams.get("q") ?? "").trim();

  const today = dateOnly(todayIso());

  const where: Prisma.AppointmentWhereInput = {
    slot: { calendarDay: { date: past ? { lt: today } : { gte: today } } },
    ...(past ? {} : { status: { in: UPCOMING_STATUSES } }),
    ...(q && {
      patient: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
    }),
  };

  const appointments = await prisma.appointment.findMany({
    where,
    take: MAX_ROWS,
    orderBy: { slot: { startAt: past ? "desc" : "asc" } },
    include: {
      slot: { include: { calendarDay: { select: { date: true } } } },
      patient: { select: patientSelect },
    },
  });

  const items: BookedAppointmentDTO[] = appointments.map((a) => ({
    dayIso: toIsoDate(a.slot.calendarDay.date),
    slot: toSlotDTO(a.slot, {
      id: a.id,
      status: a.status,
      note: a.note,
      patient: a.patient,
    }),
  }));

  return NextResponse.json({ items });
});
