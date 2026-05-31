import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";
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

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const { from, to } = calendarRangeSchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

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
  } catch (e) {
    return jsonError(e);
  }
}
