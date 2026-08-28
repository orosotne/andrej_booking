// Booking statistics: how many patients were BOOKED in a given period, split by
// how far ahead their appointment was scheduled.
//
// Two different dates are in play and must not be confused:
//   • the booking date   — Appointment.createdAt (the day the entry was made)
//   • the appointment date — slot.startAt (the day the patient comes in)
// Buckets are keyed by the BOOKING date; the category is derived from the gap
// between the two ("lead days"). Both dates are read in clinic-local time.

import {
  CLINIC_MONTHS_SHORT,
  addMonths,
  clinicDate,
  clinicMonthLabel,
  clinicShortDate,
  isoAddDays,
  isoWeekNumber,
  isoWeekStart,
  isoWeekYear,
} from "./format";
import type {
  AppointmentTypeLit,
  PatientCategoryLit,
} from "./slot-engine/types";

export const STAT_CATEGORIES = [
  "LEAD_0_100",
  "LEAD_100_250",
  "LEAD_250_PLUS",
  "ECHO",
  "AKUTNE",
] as const;

export type StatCategory = (typeof STAT_CATEGORIES)[number];

export const STAT_CATEGORY_LABEL: Record<StatCategory, string> = {
  LEAD_0_100: "Dispenzár do 100 dní",
  LEAD_100_250: "Dispenzár 100 – 250 dní",
  LEAD_250_PLUS: "Dispenzár nad 250 dní",
  ECHO: "Echo",
  AKUTNE: "Akútne vyšetrenie",
};

/**
 * The three lead-time bands together form the "dispensary" subtotal reported
 * next to the grand total. (Strictly they also carry the rare first-visit and
 * "iné" bookings — see classifyAppointment.)
 */
export const DISPENSARY_CATEGORIES = [
  "LEAD_0_100",
  "LEAD_100_250",
  "LEAD_250_PLUS",
] as const satisfies readonly StatCategory[];

/** Short forms for the chart legend and narrow table headers. */
export const STAT_CATEGORY_SHORT: Record<StatCategory, string> = {
  LEAD_0_100: "do 100 dní",
  LEAD_100_250: "100 – 250 dní",
  LEAD_250_PLUS: "nad 250 dní",
  ECHO: "Echo",
  AKUTNE: "Akútne",
};

export type StatCounts = Record<StatCategory, number>;

export function emptyCounts(): StatCounts {
  return {
    LEAD_0_100: 0,
    LEAD_100_250: 0,
    LEAD_250_PLUS: 0,
    ECHO: 0,
    AKUTNE: 0,
  };
}

export type Granularity = "day" | "week" | "month" | "year";

export const GRANULARITIES: readonly Granularity[] = [
  "day",
  "week",
  "month",
  "year",
];

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "Deň",
  week: "Týždeň",
  month: "Mesiac",
  year: "Rok",
};

/** Locative plural, for headings like "po mesiacoch". */
export const GRANULARITY_PLURAL: Record<Granularity, string> = {
  day: "dňoch",
  week: "týždňoch",
  month: "mesiacoch",
  year: "rokoch",
};

/**
 * Whole calendar days between the booking day and the appointment day, both
 * taken as clinic-local dates so a 07:00 appointment booked at 15:00 the day
 * before counts as 1 day, never 0.9.
 */
export function leadDays(createdAtIso: string, startAtIso: string): number {
  const booked = clinicDate(createdAtIso);
  const appointment = clinicDate(startAtIso);
  return Math.round(
    (Date.parse(`${appointment}T00:00:00.000Z`) -
      Date.parse(`${booked}T00:00:00.000Z`)) /
      86_400_000,
  );
}

export interface StatInput {
  createdAt: string;
  startAt: string;
  patientCategory: PatientCategoryLit | null;
  appointmentType: AppointmentTypeLit;
}

/**
 * Assigns one appointment to exactly one of the five reported categories.
 *
 * Echo and acute bookings are reported on their own, so they are recognised
 * first; everything else (dispensary, first visit, other) is split by lead time.
 * The staff-chosen patientCategory wins; the slot type is only a fallback for
 * rows created before that field existed.
 */
export function classifyAppointment(a: StatInput): StatCategory {
  const category =
    a.patientCategory ??
    (a.appointmentType === "ECHO"
      ? "ECHO"
      : a.appointmentType === "ACUTE_RESERVE"
        ? "AKUTNE"
        : null);

  if (category === "AKUTNE") return "AKUTNE";
  if (category === "ECHO") return "ECHO";

  const days = leadDays(a.createdAt, a.startAt);
  if (days <= 100) return "LEAD_0_100";
  if (days <= 250) return "LEAD_100_250";
  return "LEAD_250_PLUS";
}

/** Bucket key a clinic-local booking date falls into, e.g. "2026-W31". */
export function bucketKey(granularity: Granularity, isoDate: string): string {
  switch (granularity) {
    case "day":
      return isoDate;
    case "week":
      return `${isoWeekYear(isoDate)}-W${String(isoWeekNumber(isoDate)).padStart(2, "0")}`;
    case "month":
      return isoDate.slice(0, 7);
    case "year":
      return isoDate.slice(0, 4);
  }
}

/**
 * Every bucket key between two dates, inclusive and without gaps, so a chart
 * keeps a continuous axis even for periods with no bookings at all.
 */
export function bucketKeys(
  granularity: Granularity,
  fromIso: string,
  toIso: string,
): string[] {
  const keys: string[] = [];
  if (fromIso > toIso) return keys;

  switch (granularity) {
    case "day": {
      for (let d = fromIso; d <= toIso; d = isoAddDays(d, 1)) keys.push(d);
      return keys;
    }
    case "week": {
      const last = bucketKey("week", toIso);
      for (
        let monday = isoWeekStart(isoWeekYear(fromIso), isoWeekNumber(fromIso));
        ;
        monday = isoAddDays(monday, 7)
      ) {
        const key = bucketKey("week", monday);
        keys.push(key);
        if (key === last) return keys;
        // Safety net against a malformed range producing an endless loop.
        if (monday > toIso) return keys;
      }
    }
    case "month": {
      const last = toIso.slice(0, 7);
      let year = Number(fromIso.slice(0, 4));
      let month = Number(fromIso.slice(5, 7));
      for (;;) {
        const key = `${year}-${String(month).padStart(2, "0")}`;
        keys.push(key);
        if (key >= last) return keys;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
    case "year": {
      for (
        let year = Number(fromIso.slice(0, 4));
        year <= Number(toIso.slice(0, 4));
        year += 1
      ) {
        keys.push(String(year));
      }
      return keys;
    }
  }
}

/** Monday (YYYY-MM-DD) of a "YYYY-Www" week key. */
export function weekKeyStart(key: string): string {
  return isoWeekStart(Number(key.slice(0, 4)), Number(key.slice(6)));
}

/** Human label for a bucket key, e.g. "37. týždeň (7. 9. 2026)". */
export function bucketLabel(granularity: Granularity, key: string): string {
  switch (granularity) {
    case "day":
      return clinicShortDate(key);
    case "week": {
      const start = weekKeyStart(key);
      return `${Number(key.slice(6))}. týždeň (${clinicShortDate(start)} – ${clinicShortDate(isoAddDays(start, 6))})`;
    }
    case "month":
      return clinicMonthLabel(`${key}-01`);
    case "year":
      return key;
  }
}

/** Compact label for the chart axis, where space is tight. */
export function bucketShortLabel(granularity: Granularity, key: string): string {
  switch (granularity) {
    case "day":
      return String(Number(key.slice(8)));
    case "week":
      return String(Number(key.slice(6)));
    case "month":
      return CLINIC_MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
    case "year":
      return key;
  }
}

export interface StatBucket {
  key: string;
  label: string;
  counts: StatCounts;
  total: number;
}

export function sumCounts(counts: StatCounts): number {
  return STAT_CATEGORIES.reduce((n, c) => n + counts[c], 0);
}

export function sumDispensary(counts: StatCounts): number {
  return DISPENSARY_CATEGORIES.reduce((n, c) => n + counts[c], 0);
}

/**
 * Groups appointments into a continuous series of buckets over [from, to].
 * Rows outside the range are ignored, so the caller can pass a slightly wider
 * query result without skewing the totals.
 */
export function aggregate(
  appointments: StatInput[],
  granularity: Granularity,
  fromIso: string,
  toIso: string,
): StatBucket[] {
  const byKey = new Map<string, StatCounts>();
  for (const key of bucketKeys(granularity, fromIso, toIso)) {
    byKey.set(key, emptyCounts());
  }

  for (const a of appointments) {
    const bookedOn = clinicDate(a.createdAt);
    if (bookedOn < fromIso || bookedOn > toIso) continue;
    const counts = byKey.get(bucketKey(granularity, bookedOn));
    if (!counts) continue;
    counts[classifyAppointment(a)] += 1;
  }

  return [...byKey].map(([key, counts]) => ({
    key,
    label: bucketLabel(granularity, key),
    counts,
    total: sumCounts(counts),
  }));
}

// ---------------------------------------------------------------------------
// Averages. The clinic books patients on Thursdays and Fridays, so a fair
// "average per day/week/month/year" must be measured in those booking days:
// a Monday with zero bookings is not a slow day, it is no day at all.

/** True for Thursday and Friday — the clinic's booking days. */
export function isBookingDay(isoDate: string): boolean {
  const dow = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return dow === 4 || dow === 5;
}

function countBookingDays(fromIso: string, toIso: string): number {
  let n = 0;
  for (let d = fromIso; d <= toIso; d = isoAddDays(d, 1)) {
    if (isBookingDay(d)) n += 1;
  }
  return n;
}

/**
 * How many periods of the given granularity the range [from, to] covers,
 * measured in booking days. A day period is one Thursday or Friday; longer
 * periods only partially inside the range count fractionally by how many of
 * their booking days the range contains — a month with 4 of its 8 booking
 * days in range counts as half a month, so partial periods do not dilute
 * the average.
 */
export function bookingDayPeriods(
  granularity: Granularity,
  fromIso: string,
  toIso: string,
): number {
  if (fromIso > toIso) return 0;
  if (granularity === "day") return countBookingDays(fromIso, toIso);
  if (granularity === "week") return countBookingDays(fromIso, toIso) / 2;

  const fullBucket = new Map<string, number>();
  let periods = 0;
  for (let d = fromIso; d <= toIso; d = isoAddDays(d, 1)) {
    if (!isBookingDay(d)) continue;
    const key = bucketKey(granularity, d);
    let full = fullBucket.get(key);
    if (full === undefined) {
      full =
        granularity === "month"
          ? countBookingDays(`${key}-01`, isoAddDays(addMonths(`${key}-01`, 1), -1))
          : countBookingDays(`${key}-01-01`, `${key}-12-31`);
      fullBucket.set(key, full);
    }
    periods += 1 / full;
  }
  return periods;
}

/**
 * Category counts of the bookings made on a Thursday or Friday inside
 * [from, to] — the numerator of the booking-day averages.
 */
export function bookingDayTotals(
  appointments: StatInput[],
  fromIso: string,
  toIso: string,
): StatCounts {
  const counts = emptyCounts();
  for (const a of appointments) {
    const bookedOn = clinicDate(a.createdAt);
    if (bookedOn < fromIso || bookedOn > toIso || !isBookingDay(bookedOn)) {
      continue;
    }
    counts[classifyAppointment(a)] += 1;
  }
  return counts;
}

/** Average bookings per period, computed from booking days (Thu + Fri) only. */
export interface StatAverages {
  /** The window the averages actually cover — the requested range clamped to
   * the first booking ever made and to today. */
  from: string;
  to: string;
  /** Booking-day periods inside the window; fractional for partial periods. */
  periods: number;
  counts: StatCounts;
  dispensary: number;
  total: number;
}

export function computeAverages(
  appointments: StatInput[],
  granularity: Granularity,
  fromIso: string,
  toIso: string,
): StatAverages | null {
  const periods = bookingDayPeriods(granularity, fromIso, toIso);
  if (periods <= 0) return null;

  const totals = bookingDayTotals(appointments, fromIso, toIso);
  const counts = emptyCounts();
  for (const c of STAT_CATEGORIES) counts[c] = totals[c] / periods;
  return {
    from: fromIso,
    to: toIso,
    periods,
    counts,
    dispensary: sumDispensary(totals) / periods,
    total: sumCounts(totals) / periods,
  };
}
