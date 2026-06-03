import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";

const querySchema = z.object({
  type: z.enum(["DISPENSARY", "ECHO", "PRE_HOSPITAL"]),
  // 0 = "najbližší termín" (od zajtra ďalej, nie dnes);
  // 3/6/11 = prvý voľný termín o N mesiacov a neskôr.
  months: z.coerce.number().int().refine((n) => [0, 3, 6, 11].includes(n), {
    message: "months musí byť 0, 3, 6 alebo 11",
  }),
  // Voliteľný horný strop "do N mesiacov" (zrkadlí dolný `months`). Keď je
  // zadaný, slot musí začať pred dnes+N mesiacov. Bez neho je horizont
  // neohraničený zhora (pôvodné správanie kalendárového pickera).
  maxMonths: z.coerce.number().int().positive().optional(),
});

/**
 * Returns the earliest AVAILABLE slot of `type` for the requested horizon, or
 * null if none is open. months=0 → najbližší termín, ale NIE dnes (od zajtra
 * ďalej). months=N → prvý voľný termín o aspoň N mesiacov (nie "do N mesiacov",
 * inak by to vždy bol zajtrajšok). Voliteľný maxMonths pridá horný strop "do N
 * mesiacov" (napr. months=0 + maxMonths=1 = najbližší termín do mesiaca). Closed
 * days are excluded. Used by the "Najbližší termín" picker in the calendar header
 * and the patient detail quick-book.
 */
export const GET = defineRoute({ roles: ALL_STAFF }, async ({ req }) => {
  const url = new URL(req.url);
  const { type, months, maxMonths } = querySchema.parse({
    type: url.searchParams.get("type"),
    months: url.searchParams.get("months"),
    maxMonths: url.searchParams.get("maxMonths") ?? undefined,
  });

  const now = new Date();
  // Najbližší (months=0): vylúč dnešok cez calendarDay.date > dnes (@db.Date je
  // polnoc UTC, takže to znamená „od zajtra ďalej“). Horizont (N>0): prvý slot,
  // ktorý začína aspoň N mesiacov od dnes. maxMonths (voliteľný): horný strop —
  // slot musí začať pred dnes+maxMonths mesiacov.
  const calendarDayFilter =
    months === 0
      ? { status: { not: "CLOSED" as const }, date: { gt: dateOnly(toIsoDate(now)) } }
      : { status: { not: "CLOSED" as const } };
  const monthOffset = (n: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, now.getUTCDate()));
  const startAt =
    months === 0 && maxMonths === undefined
      ? undefined
      : {
          ...(months > 0 ? { gte: monthOffset(months) } : {}),
          ...(maxMonths !== undefined ? { lt: monthOffset(maxMonths) } : {}),
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
});
