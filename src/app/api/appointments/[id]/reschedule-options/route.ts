import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";
import type { SlotDTO } from "@/lib/api-types";
import type { AppointmentTypeLit, SlotStatusLit } from "@/lib/slot-engine/types";

// How many nearest free slots the reschedule picker offers.
const NEAREST_LIMIT = 3;

// Nearest available slots of the same type, from now forward, for moving an
// appointment. Returns serialized SlotDTOs paired with their calendar-day ISO.
export const GET = defineRoute({ roles: ALL_STAFF }, async ({ params }) => {
  const { id } = params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { appointmentType: true },
  });
  if (!appointment) throw new NotFoundError("Objednávka neexistuje.");

  const slots = await prisma.appointmentSlot.findMany({
    where: {
      appointmentType: appointment.appointmentType,
      status: "AVAILABLE",
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    take: NEAREST_LIMIT,
    include: { calendarDay: { select: { date: true } } },
  });

  const options = slots.map((slot) => ({
    dayIso: slot.calendarDay.date.toISOString().slice(0, 10),
    slot: {
      id: slot.id,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      appointmentType: slot.appointmentType as AppointmentTypeLit,
      status: slot.status as SlotStatusLit,
      releaseAt: slot.releaseAt ? slot.releaseAt.toISOString() : null,
      color: slot.color,
      lockedReason: slot.lockedReason,
      appointment: null,
    } satisfies SlotDTO,
  }));

  return NextResponse.json({ options });
});
