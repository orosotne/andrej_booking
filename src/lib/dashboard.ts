import { isoAddDays, monthOf } from "./format";
import { weekdayOf } from "./calendar-ui";
import { isLastFridayOfMonth, dateOnly } from "./calendar-date";
import { holidayName, holidaysBetween } from "./holidays-sk";

/**
 * Pure logic behind the /prehlad dashboard: which day to lead with, what counts
 * as a missing day, which holidays are about to close a day. Kept free of
 * Prisma so it can be unit-tested without a database, exactly like
 * lib/statistics.ts.
 */

/** The minimum a day must expose for the focus/attention logic to work. */
export interface DaySummary {
  date: string; // YYYY-MM-DD
  status: string; // CLOSED | GENERATED | OPEN | PARTIALLY_LOCKED
  dayType: string;
  note: string | null;
  slotCount: number;
}

/**
 * The day the dashboard should lead with, plus the one after it.
 *
 * The clinic works Wed/Thu/Fri, so on a Monday "today" is empty and a dashboard
 * that led with it would look broken. Rule: today if it is a working day with
 * slots and is not closed, otherwise the next such day. `isToday` lets the UI
 * say "dnes" instead of naming the date.
 */
export function pickFocusDays(
  days: DaySummary[],
  today: string,
): { focus: DaySummary | null; next: DaySummary | null; isToday: boolean } {
  const usable = days
    .filter((d) => d.date >= today && d.slotCount > 0 && d.status !== "CLOSED")
    .sort((a, b) => a.date.localeCompare(b.date));
  const focus = usable[0] ?? null;
  return {
    focus,
    next: usable[1] ?? null,
    isToday: focus?.date === today,
  };
}

/**
 * Thursdays and Fridays in the next `weeks` weeks that the generator should
 * have produced but did not — a silent-cron-failure detector.
 *
 * Wednesdays and last Fridays are excluded because generateForward skips them
 * on purpose (they are password-gated extra days). Without those two exclusions
 * this would raise an alarm every single month.
 */
export function missingWorkingDays(
  days: DaySummary[],
  today: string,
  weeks = 8,
): string[] {
  const bySlots = new Map(days.map((d) => [d.date, d.slotCount]));
  const out: string[] = [];
  const end = isoAddDays(today, weeks * 7);
  for (let iso = today; iso <= end; iso = isoAddDays(iso, 1)) {
    const dow = weekdayOf(iso);
    if (dow !== 4 && dow !== 5) continue; // Thu/Fri only — never Wednesday
    if (dow === 5 && isLastFridayOfMonth(dateOnly(iso))) continue;
    if (holidayName(iso)) continue; // holidays are closed on purpose
    if ((bySlots.get(iso) ?? 0) === 0) out.push(iso);
  }
  return out;
}

export interface HolidayClosure {
  iso: string;
  name: string;
  /** True when the day is already CLOSED (or has no slots to close). */
  handled: boolean;
}

/**
 * Upcoming public holidays that land on a clinic day, with whether the day has
 * already been closed. A holiday on a Mon/Tue/Sat/Sun changes nothing, so it is
 * left out.
 */
export function upcomingHolidayClosures(
  days: DaySummary[],
  today: string,
  horizonDays = 60,
): HolidayClosure[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return holidaysBetween(today, isoAddDays(today, horizonDays))
    .filter(({ iso }) => [3, 4, 5].includes(weekdayOf(iso)))
    .map(({ iso, name }) => {
      const day = byDate.get(iso);
      return {
        iso,
        name,
        handled: !day || day.status === "CLOSED" || day.slotCount === 0,
      };
    });
}

/** Wednesdays that were opened by password — an exception everyone should see. */
export function openedWednesdays(days: DaySummary[], today: string): string[] {
  return days
    .filter(
      (d) =>
        d.date >= today &&
        d.dayType === "MANUAL_WEDNESDAY" &&
        d.status !== "CLOSED" &&
        d.slotCount > 0,
    )
    .map((d) => d.date)
    .sort();
}

export interface NoShowCounts {
  arrived: number;
  completed: number;
  noShow: number;
}

/**
 * Share of resolved past appointments that were no-shows, 0–1. Null when
 * nothing has been resolved yet — a rate over an empty denominator is not "0 %",
 * it is "unknown", and the UI must say so rather than print a reassuring zero.
 */
export function noShowRate(c: NoShowCounts): number | null {
  const resolved = c.arrived + c.completed + c.noShow;
  return resolved === 0 ? null : c.noShow / resolved;
}

export interface CapacitySlot {
  startAt: string; // ISO instant
  appointmentType: string;
  status: string;
}

export interface CapacityBucket {
  free14: number;
  free30: number;
  total30: number;
}

export type CapacityKind = "akut" | "disp" | "echo";

function capacityKind(type: string): CapacityKind | null {
  if (type === "PRE_HOSPITAL" || type === "ACUTE_RESERVE") return "akut";
  if (type === "DISPENSARY") return "disp";
  if (type === "ECHO") return "echo";
  return null;
}

/**
 * Free/total bookable capacity per kind over the next 14 and 30 days.
 * `total30` counts AVAILABLE + BOOKED, i.e. the real capacity, so "3 z 12"
 * reads the way staff expect. LOCKED slots are neither — they are not yet
 * offerable, and lumping them in would overstate what can be promised today.
 */
export function bucketCapacity(
  slots: CapacitySlot[],
  today: string,
): Record<CapacityKind, CapacityBucket> {
  const mk = (): CapacityBucket => ({ free14: 0, free30: 0, total30: 0 });
  const r: Record<CapacityKind, CapacityBucket> = {
    akut: mk(),
    disp: mk(),
    echo: mk(),
  };
  const day14 = isoAddDays(today, 14);
  for (const s of slots) {
    const kind = capacityKind(s.appointmentType);
    if (!kind) continue;
    if (s.status !== "AVAILABLE" && s.status !== "BOOKED") continue;
    r[kind].total30++;
    if (s.status !== "AVAILABLE") continue;
    r[kind].free30++;
    if (s.startAt.slice(0, 10) <= day14) r[kind].free14++;
  }
  return r;
}

/** First and last day of the 12-month window the trend section charts. */
export function trendRange(today: string): { from: string; to: string } {
  const month = monthOf(today);
  const first = `${month}-01`;
  const d = new Date(`${first}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 11, 1);
  return { from: d.toISOString().slice(0, 10), to: today };
}
