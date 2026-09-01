import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { isoAddDays, todayIso } from "@/lib/format";
import { countSlots, availByType } from "@/lib/calendar-ui";
import { holidayName } from "@/lib/holidays-sk";
import { pendingReleaseWhere } from "@/lib/slot-engine/release";
import { SLOT_OCCUPYING_STATUSES } from "@/lib/appointment-status";
import {
  pickFocusDays,
  missingWorkingDays,
  upcomingHolidayClosures,
  openedWednesdays,
  noShowRate,
  bucketCapacity,
  type DaySummary,
} from "@/lib/dashboard";
import type {
  DashboardResponse,
  DashboardDayDTO,
  DashboardCapacityDTO,
  SlotCountsDTO,
} from "@/lib/api-types";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";
import { toSlotDTO } from "@/lib/slot-dto";

const DAY_HORIZON = 60; // days ahead for the day scan / holidays / Wednesdays
const CAPACITY_HORIZON = 30;
const NO_SHOW_WINDOW = 90; // days back, and the same again for the trend
const BOOKABLE_TYPES: AppointmentTypeLit[] = ["PRE_HOSPITAL", "DISPENSARY", "ECHO"];

/**
 * One aggregate read for the whole /prehlad page. Everything here is bounded by
 * a date horizon and covered by an existing index; nothing writes.
 *
 * ALL_STAFF: the patient names in the focus day are the same data /api/calendar
 * already returns to every role. The one block that is not for everyone
 * (manualLocks, an ADMIN_ONLY concern elsewhere) is omitted from the payload
 * rather than merely hidden in the UI.
 */
export const GET = defineRoute({ roles: ALL_STAFF }, async ({ user }) => {
  const now = new Date();
  const today = todayIso();
  const horizonIso = isoAddDays(today, DAY_HORIZON);

  // 1. Cheap scan of the day rows: enough to pick the focus day and to answer
  //    every "vyžaduje pozornosť" question. No slot payload.
  const dayRows = await prisma.calendarDay.findMany({
    where: { date: { gte: dateOnly(today), lte: dateOnly(horizonIso) } },
    select: {
      date: true,
      status: true,
      dayType: true,
      note: true,
      closedByVacationId: true,
      _count: { select: { slots: true } },
    },
    orderBy: { date: "asc" },
  });
  const days: DaySummary[] = dayRows.map((d) => ({
    date: toIsoDate(d.date),
    status: d.status,
    dayType: d.dayType,
    note: d.note,
    slotCount: d._count.slots,
  }));

  const { focus, next, isToday } = pickFocusDays(days, today);
  const focusDates = [focus?.date, next?.date].filter(
    (d): d is string => typeof d === "string",
  );

  const capacityFrom = isoAddDays(today, 1);
  const capacityTo = isoAddDays(today, CAPACITY_HORIZON);
  const noShowFrom = isoAddDays(today, -NO_SHOW_WINDOW);
  const noShowPrevFrom = isoAddDays(today, -2 * NO_SHOW_WINDOW);
  const since24h = new Date(now.getTime() - 24 * 3600_000);

  const [
    focusDays,
    capacitySlots,
    nextFreeRows,
    released24h,
    nextRelease,
    vacations,
    noShowNow,
    noShowPrev,
    unresolved,
    manualLockRows,
    manualLockTotal,
  ] = await Promise.all([
    // 2. Full slot payload, but only for the one or two days actually shown.
    focusDates.length
      ? prisma.calendarDay.findMany({
          where: { date: { in: focusDates.map(dateOnly) } },
          include: {
            slots: {
              orderBy: { startAt: "asc" },
              include: {
                appointments: {
                  where: { status: { in: SLOT_OCCUPYING_STATUSES } },
                  include: {
                    patient: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        note: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),

    // 3. Near-term capacity — ~250 rows, bucketed in JS for both windows.
    prisma.appointmentSlot.findMany({
      where: {
        startAt: {
          gte: dateOnly(capacityFrom),
          lt: dateOnly(isoAddDays(capacityTo, 1)),
        },
        status: { in: ["AVAILABLE", "BOOKED"] },
        appointmentType: { in: BOOKABLE_TYPES },
        calendarDay: { status: { not: "CLOSED" } },
      },
      select: { startAt: true, appointmentType: true, status: true },
    }),

    // 4. Nearest free slot per kind — one row each, index-covered on start_at.
    Promise.all(
      BOOKABLE_TYPES.map((t) =>
        prisma.appointmentSlot.findFirst({
          where: {
            appointmentType: t,
            status: "AVAILABLE",
            startAt: { gte: now },
            calendarDay: { status: { not: "CLOSED" } },
          },
          orderBy: { startAt: "asc" },
          select: { startAt: true, appointmentType: true },
        }),
      ),
    ),

    // 5. What the cron opened in the last 24 h.
    prisma.appointmentSlot.groupBy({
      by: ["appointmentType"],
      where: {
        releaseAt: { gt: since24h, lte: now },
        status: { in: ["AVAILABLE", "BOOKED"] },
      },
      _count: { _all: true },
    }),

    // 6. What it opens next — same predicate the cron uses.
    prisma.appointmentSlot.findFirst({
      where: pendingReleaseWhere(now),
      orderBy: { releaseAt: "asc" },
      select: { releaseAt: true },
    }),

    // 7. Vacations overlapping the next 30 days.
    prisma.vacation.findMany({
      where: {
        startDate: { lte: dateOnly(capacityTo) },
        endDate: { gte: dateOnly(today) },
      },
      orderBy: { startDate: "asc" },
    }),

    // 8. Attendance over the last 90 days, and the 90 before that.
    prisma.appointment.groupBy({
      by: ["status"],
      where: { slot: { startAt: { gte: dateOnly(noShowFrom), lt: now } } },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: {
        slot: {
          startAt: { gte: dateOnly(noShowPrevFrom), lt: dateOnly(noShowFrom) },
        },
      },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: {
        status: "SCHEDULED",
        slot: { startAt: { gte: dateOnly(noShowFrom), lt: now } },
      },
    }),

    // 9. ADMIN only — a manual lock is a promise that gets forgotten.
    user.role === "ADMIN"
      ? prisma.appointmentSlot.findMany({
          where: {
            status: "LOCKED",
            manualLock: true,
            startAt: { gte: now, lt: dateOnly(isoAddDays(horizonIso, 1)) },
          },
          orderBy: { startAt: "asc" },
          take: 6,
          select: {
            id: true,
            startAt: true,
            endAt: true,
            appointmentType: true,
            lockedReason: true,
          },
        })
      : Promise.resolve([]),
    user.role === "ADMIN"
      ? prisma.appointmentSlot.count({
          where: { status: "LOCKED", manualLock: true, startAt: { gte: now } },
        })
      : Promise.resolve(0),
  ]);

  // --- focus / next day -----------------------------------------------------
  const nowIso = now.toISOString();
  const dayByDate = new Map(focusDays.map((d) => [toIsoDate(d.date), d]));

  function toDayDTO(summary: DaySummary | null): DashboardDayDTO | null {
    if (!summary) return null;
    const row = dayByDate.get(summary.date);
    if (!row) return null;
    const slots = row.slots.map((s) => toSlotDTO(s, s.appointments[0] ?? null));
    let arrived = 0;
    let noShow = 0;
    let completed = 0;
    let unresolvedToday = 0;
    const appointments = [];
    for (const s of slots) {
      const a = s.appointment;
      if (!a) continue;
      if (a.status === "ARRIVED") arrived++;
      else if (a.status === "NO_SHOW") noShow++;
      else if (a.status === "COMPLETED") completed++;
      else if (s.startAt < nowIso) unresolvedToday++;
      appointments.push({
        id: a.id,
        startAt: s.startAt,
        appointmentType: s.appointmentType,
        status: a.status,
        patientName: `${a.patient.lastName} ${a.patient.firstName}`,
        phone: a.patient.phone,
      });
    }
    // "ešte voľných" must exclude slots that already started, matching the day
    // view; the plain counts keep the day's full picture.
    const counts: SlotCountsDTO = countSlots(slots);
    return {
      date: summary.date,
      status: summary.status,
      note: summary.note,
      holiday: holidayName(summary.date),
      counts,
      freeRemaining: countSlots(slots, nowIso).available,
      byType: availByType(slots),
      arrived,
      noShow,
      completed,
      unresolved: unresolvedToday,
      appointments,
    };
  }

  // --- capacity -------------------------------------------------------------
  const buckets = bucketCapacity(
    capacitySlots.map((s) => ({
      startAt: s.startAt.toISOString(),
      appointmentType: s.appointmentType,
      status: s.status,
    })),
    today,
  );
  const nextFreeByType = new Map(
    nextFreeRows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => [r.appointmentType, r.startAt.toISOString()]),
  );
  const cap = (
    kind: "akut" | "disp" | "echo",
    type: AppointmentTypeLit,
  ): DashboardCapacityDTO => ({
    ...buckets[kind],
    nextFreeAt: nextFreeByType.get(type) ?? null,
  });

  // --- release --------------------------------------------------------------
  const rel = { akut: 0, disp: 0, echo: 0, total: 0 };
  for (const row of released24h) {
    const n = row._count._all;
    rel.total += n;
    if (row.appointmentType === "PRE_HOSPITAL" || row.appointmentType === "ACUTE_RESERVE")
      rel.akut += n;
    else if (row.appointmentType === "DISPENSARY") rel.disp += n;
    else if (row.appointmentType === "ECHO") rel.echo += n;
  }
  const nextAt = nextRelease?.releaseAt ?? null;
  const nextCount = nextAt
    ? await prisma.appointmentSlot.count({
        where: { ...pendingReleaseWhere(now), releaseAt: nextAt },
      })
    : 0;

  // --- no-show --------------------------------------------------------------
  const tally = (rows: { status: string; _count: { _all: number } }[]) => {
    const get = (s: string) =>
      rows.find((r) => r.status === s)?._count._all ?? 0;
    return {
      arrived: get("ARRIVED"),
      completed: get("COMPLETED"),
      noShow: get("NO_SHOW"),
    };
  };
  const cur = tally(noShowNow);
  const prev = tally(noShowPrev);

  const body: DashboardResponse = {
    generatedAt: nowIso,
    today,
    focus: toDayDTO(focus),
    focusIsToday: isToday,
    next: toDayDTO(next),
    capacity: {
      akut: cap("akut", "PRE_HOSPITAL"),
      disp: cap("disp", "DISPENSARY"),
      echo: cap("echo", "ECHO"),
    },
    attention: {
      missingDays: missingWorkingDays(days, today),
      holidays: upcomingHolidayClosures(days, today, DAY_HORIZON),
      vacations: vacations.map((v) => ({
        id: v.id,
        from: toIsoDate(v.startDate),
        to: toIsoDate(v.endDate),
        reason: v.reason,
        createdAt: v.createdAt.toISOString(),
      })),
      openedWednesdays: openedWednesdays(days, today),
      closedDays: dayRows
        .filter((d) => d.status === "CLOSED" && d.closedByVacationId === null)
        .map((d) => ({
          date: toIsoDate(d.date),
          note: d.note,
          holiday: holidayName(toIsoDate(d.date)),
        })),
    },
    release: { last24h: rel, nextAt: nextAt?.toISOString() ?? null, nextCount },
    noShow: {
      rate: noShowRate(cur),
      previousRate: noShowRate(prev),
      noShow: cur.noShow,
      resolved: cur.arrived + cur.completed + cur.noShow,
      unresolved,
      days: NO_SHOW_WINDOW,
    },
    ...(user.role === "ADMIN"
      ? {
          manualLocks: {
            total: manualLockTotal,
            upcoming: manualLockRows.map((s) => ({
              id: s.id,
              startAt: s.startAt.toISOString(),
              endAt: s.endAt.toISOString(),
              appointmentType: s.appointmentType as AppointmentTypeLit,
              lockedReason: s.lockedReason,
            })),
          },
        }
      : {}),
  };
  return NextResponse.json(body);
});
