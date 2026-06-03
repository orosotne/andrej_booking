import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { ValidationError } from "@/lib/errors";
import { calendarRangeSchema } from "@/lib/validation";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";

const querySchema = calendarRangeSchema.extend({
  type: z.enum(["DISPENSARY", "ECHO", "PRE_HOSPITAL"]),
});

// Same 92-day cap as /api/calendar: callers only browse one month grid at a time.
const MAX_RANGE_DAYS = 92;

/**
 * Returns every AVAILABLE slot of `type` whose day falls in [from, to] and is
 * after today (booking convention "od zajtra", mirroring /api/slots/next
 * months=0). Closed days are excluded. Powers the manual calendar slot picker
 * in the patient detail quick-book.
 */
export const GET = defineRoute({ roles: ALL_STAFF }, async ({ req }) => {
  const url = new URL(req.url);
  const { type, from, to } = querySchema.parse({
    type: url.searchParams.get("type"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new ValidationError("Rozsah kalendára je príliš veľký.");
  }

  // Lower bound is the later of the requested `from` and tomorrow.
  const tomorrow = toIsoDate(new Date(Date.now() + 86_400_000));
  const lowerIso = from > tomorrow ? from : tomorrow;

  const slots = await prisma.appointmentSlot.findMany({
    where: {
      status: "AVAILABLE",
      appointmentType: type as AppointmentTypeLit,
      calendarDay: {
        status: { not: "CLOSED" },
        date: { gte: dateOnly(lowerIso), lte: dateOnly(to) },
      },
    },
    orderBy: { startAt: "asc" },
    include: { calendarDay: { select: { date: true } } },
  });

  return NextResponse.json({
    slots: slots.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      appointmentType: slot.appointmentType,
      date: slot.calendarDay.date.toISOString().slice(0, 10),
    })),
  });
});
