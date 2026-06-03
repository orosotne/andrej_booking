import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { ValidationError } from "@/lib/errors";
import { calendarRangeSchema } from "@/lib/validation";
import { dateOnly } from "@/lib/calendar-date";
import type { CalendarResponse, SlotDTO } from "@/lib/api-types";
import type { AppointmentTypeLit, SlotStatusLit } from "@/lib/slot-engine/types";
import type { AppointmentStatus } from "@/generated/prisma/client";

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "SCHEDULED",
  "ARRIVED",
  "COMPLETED",
  "NO_SHOW",
];

// This endpoint pulls the full nested payload (days → slots → appointments →
// patient), so the span is capped. The only callers are the week (7-day) and
// month (42-day) grids, so 92 days leaves a wide margin while rejecting a
// pathological multi-month range that would materialise every slot at once.
// Aggregate year totals go to /api/calendar/stats (a cheap GROUP BY), uncapped.
const MAX_RANGE_DAYS = 92;

export const GET = defineRoute({ roles: ALL_STAFF }, async ({ req }) => {
  const url = new URL(req.url);
  const { from, to } = calendarRangeSchema.parse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new ValidationError("Rozsah kalendára je príliš veľký.");
  }

  const days = await prisma.calendarDay.findMany({
    where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
    orderBy: { date: "asc" },
    include: {
      slots: {
        orderBy: { startAt: "asc" },
        include: {
          appointments: {
            where: { status: { in: ACTIVE_APPOINTMENT_STATUSES } },
            include: {
              patient: {
                select: { id: true, firstName: true, lastName: true, phone: true },
              },
            },
          },
        },
      },
    },
  });

  const response: CalendarResponse = {
    days: days.map((day) => ({
      id: day.id,
      date: day.date.toISOString().slice(0, 10),
      dayType: day.dayType,
      status: day.status,
      note: day.note,
      slots: day.slots.map((slot): SlotDTO => {
        const active = slot.appointments[0] ?? null;
        return {
          id: slot.id,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          appointmentType: slot.appointmentType as AppointmentTypeLit,
          status: slot.status as SlotStatusLit,
          releaseAt: slot.releaseAt ? slot.releaseAt.toISOString() : null,
          color: slot.color,
          lockedReason: slot.lockedReason,
          appointment: active
            ? {
                id: active.id,
                status: active.status,
                note: active.note,
                patient: active.patient,
              }
            : null,
        };
      }),
    })),
  };

  return NextResponse.json(response);
});
