import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { statisticsQuerySchema } from "@/lib/validation";
import { dateOnly } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { clinicDate, isoAddDays, todayIso } from "@/lib/format";
import {
  STAT_CATEGORIES,
  aggregate,
  computeAverages,
  emptyCounts,
  sumCounts,
  type StatInput,
} from "@/lib/statistics";
import type {
  AppointmentTypeLit,
  PatientCategoryLit,
} from "@/lib/slot-engine/types";
import type { StatisticsResponse } from "@/lib/api-types";

// Booking statistics, grouped by the day the booking was MADE (created_at), not
// by the day of the appointment. Cancelled and rescheduled rows are left out so
// each patient is counted once, under the booking that actually stands.
export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req }) => {
  const url = new URL(req.url);
  const { granularity, from, to } = statisticsQuerySchema.parse({
    granularity: url.searchParams.get("granularity"),
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const today = todayIso();
  // The first booking ever made bounds both the "everything we have" fallback
  // range and the averaging window (empty months before go-live must not
  // dilute the averages).
  const firstCreatedAt = (
    await prisma.appointment.aggregate({ _min: { createdAt: true } })
  )._min.createdAt;
  const firstIso = firstCreatedAt
    ? clinicDate(firstCreatedAt.toISOString())
    : null;
  const fromIso = from ?? firstIso ?? today;
  const toIso = to ?? today;

  const rows =
    fromIso > toIso
      ? []
      : await prisma.appointment.findMany({
          where: {
            status: { notIn: ["CANCELLED", "RESCHEDULED"] },
            createdAt: {
              gte: wallClockToUtc(dateOnly(fromIso), "00:00"),
              lt: wallClockToUtc(dateOnly(isoAddDays(toIso, 1)), "00:00"),
            },
          },
          select: {
            createdAt: true,
            patientCategory: true,
            appointmentType: true,
            slot: { select: { startAt: true } },
          },
        });

  const inputs: StatInput[] = rows.map((r) => ({
    createdAt: r.createdAt.toISOString(),
    startAt: r.slot.startAt.toISOString(),
    patientCategory: r.patientCategory as PatientCategoryLit | null,
    appointmentType: r.appointmentType as AppointmentTypeLit,
  }));

  const buckets = aggregate(inputs, granularity, fromIso, toIso);

  const totals = emptyCounts();
  for (const b of buckets) {
    for (const c of STAT_CATEGORIES) totals[c] += b.counts[c];
  }

  // Averages run over the requested range clamped to the first booking ever
  // and to today, so months before go-live and days yet to come count for
  // nothing.
  const avgFrom = firstIso && firstIso > fromIso ? firstIso : fromIso;
  const avgTo = toIso < today ? toIso : today;
  const averages =
    avgFrom <= avgTo
      ? computeAverages(inputs, granularity, avgFrom, avgTo)
      : null;

  const body: StatisticsResponse = {
    granularity,
    from: fromIso,
    to: toIso,
    buckets,
    totals,
    total: sumCounts(totals),
    averages,
  };
  return NextResponse.json(body);
});
