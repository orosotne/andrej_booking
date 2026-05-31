// Pure calendar-date helpers. All logic uses UTC accessors so a @db.Date
// (stored as midnight UTC) is never shifted by the server timezone.

export const WEEKDAY = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
} as const;

export type DefaultDayType =
  | "REGULAR_THURSDAY"
  | "REGULAR_FRIDAY"
  | "MANUAL_WEDNESDAY"
  | "LAST_FRIDAY"
  | "CLOSED";

/** True when `d` is a Friday and there is no later Friday in the same month. */
export function isLastFridayOfMonth(d: Date): boolean {
  if (d.getUTCDay() !== WEEKDAY.FRI) return false;
  const plus7 = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7),
  );
  return plus7.getUTCMonth() !== d.getUTCMonth();
}

/** Maps a date to its default day type (before any manual opening). */
export function defaultDayType(d: Date): DefaultDayType {
  switch (d.getUTCDay()) {
    case WEEKDAY.FRI:
      return isLastFridayOfMonth(d) ? "LAST_FRIDAY" : "REGULAR_FRIDAY";
    case WEEKDAY.THU:
      return "REGULAR_THURSDAY";
    case WEEKDAY.WED:
      return "MANUAL_WEDNESDAY";
    default:
      return "CLOSED";
  }
}

/** All dates of a given weekday within the month containing `ref` (UTC). */
export function weekdaysInMonth(ref: Date, weekday: number): Date[] {
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const out: Date[] = [];
  for (let day = 1; ; day++) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCMonth() !== month) break;
    if (d.getUTCDay() === weekday) out.push(d);
  }
  return out;
}

/** Midnight-UTC Date for an ISO `YYYY-MM-DD` string. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` (UTC) for a Date. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True if the ISO date is strictly before today (UTC). */
export function isPastIsoDate(iso: string, now: Date = new Date()): boolean {
  return iso < now.toISOString().slice(0, 10);
}
