import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";

const querySchema = z.object({
  type: z.enum(["DISPENSARY", "ECHO", "PRE_HOSPITAL"]),
  months: z.coerce.number().int().refine((n) => [1, 3, 6, 9, 12].includes(n), {
    message: "months musí byť 1, 3, 6, 9 alebo 12",
  }),
});

/**
 * Returns the earliest AVAILABLE slot of `type` within `months` from today,
 * or null if no such slot is open in the window. Used by the "Najbližší
 * termín" picker in the calendar header.
 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const { type, months } = querySchema.parse({
      type: url.searchParams.get("type"),
      months: url.searchParams.get("months"),
    });

    const now = new Date();
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()),
    );

    const slot = await prisma.appointmentSlot.findFirst({
      where: {
        status: "AVAILABLE",
        appointmentType: type as AppointmentTypeLit,
        startAt: { gte: now, lte: end },
        calendarDay: { status: { not: "CLOSED" } },
      },
      orderBy: { startAt: "asc" },
      include: {
        calendarDay: { select: { date: true } },
      },
    });

    if (!slot) {
      return NextResponse.json({ slot: null });
    }

    return NextResponse.json({
      slot: {
        id: slot.id,
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        appointmentType: slot.appointmentType,
        date: slot.calendarDay.date.toISOString().slice(0, 10),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
