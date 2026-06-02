import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";

const querySchema = z.object({
  type: z.enum(["DISPENSARY", "ECHO", "PRE_HOSPITAL"]),
  // 0 = "najbližší termín" (od zajtra ďalej, nie dnes);
  // 3/6/11 = prvý voľný termín o N mesiacov a neskôr.
  months: z.coerce.number().int().refine((n) => [0, 3, 6, 11].includes(n), {
    message: "months musí byť 0, 3, 6 alebo 11",
  }),
});

/**
 * Returns the earliest AVAILABLE slot of `type` for the requested horizon, or
 * null if none is open. months=0 → najbližší termín, ale NIE dnes (od zajtra
 * ďalej). months=N → prvý voľný termín o aspoň N mesiacov (nie "do N mesiacov",
 * inak by to vždy bol zajtrajšok). Closed days are excluded. Used by the
 * "Najbližší termín" picker in the calendar header.
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
    // Najbližší (months=0): vylúč dnešok cez calendarDay.date > dnes (@db.Date je
    // polnoc UTC, takže to znamená „od zajtra ďalej“). Horizont (N>0): prvý slot,
    // ktorý začína aspoň N mesiacov od dnes (bez horného ohraničenia).
    const calendarDayFilter =
      months === 0
        ? { status: { not: "CLOSED" as const }, date: { gt: dateOnly(toIsoDate(now)) } }
        : { status: { not: "CLOSED" as const } };
    const startAt =
      months === 0
        ? undefined
        : {
            gte: new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()),
            ),
          };

    const slot = await prisma.appointmentSlot.findFirst({
      where: {
        status: "AVAILABLE",
        appointmentType: type as AppointmentTypeLit,
        calendarDay: calendarDayFilter,
        ...(startAt ? { startAt } : {}),
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
