import type { CalendarDayDTO } from "./api-types";

/** Clinic working weekdays (JS getUTCDay): Wed, Thu, Fri. */
export const WORKING_WEEKDAYS: readonly number[] = [3, 4, 5];

/** Weekday (0=Sun..6=Sat) for a `YYYY-MM-DD` string, timezone-safe. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

/** Index calendar days by their ISO date for O(1) lookup in views. */
export function buildDayMap(
  days: CalendarDayDTO[] | undefined,
): Map<string, CalendarDayDTO> {
  const map = new Map<string, CalendarDayDTO>();
  days?.forEach((d) => map.set(d.date, d));
  return map;
}
