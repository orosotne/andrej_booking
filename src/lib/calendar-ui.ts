import type { CalendarDayDTO } from "./api-types";

/** Clinic working weekdays (JS getUTCDay): Wed, Thu, Fri. */
export const WORKING_WEEKDAYS: readonly number[] = [3, 4, 5];

/** Weekday (0=Sun..6=Sat) for a `YYYY-MM-DD` string, timezone-safe. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

/**
 * First working day (Wed/Thu/Fri) strictly after `iso` in the given direction
 * (+1 = forward, -1 = back). Used by day-view navigation so the arrows skip
 * days the clinic is closed. A working day always exists within 7 steps.
 */
export function nextWorkingDay(iso: string, direction: 1 | -1): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  for (let i = 0; i < 7; i++) {
    d.setUTCDate(d.getUTCDate() + direction);
    if (WORKING_WEEKDAYS.includes(d.getUTCDay())) break;
  }
  return d.toISOString().slice(0, 10);
}

/** Index calendar days by their ISO date for O(1) lookup in views. */
export function buildDayMap(
  days: CalendarDayDTO[] | undefined,
): Map<string, CalendarDayDTO> {
  const map = new Map<string, CalendarDayDTO>();
  days?.forEach((d) => map.set(d.date, d));
  return map;
}
