import type { CalendarDayDTO, SlotDTO, SlotCountsDTO } from "./api-types";

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

/**
 * Tally slots into free / booked / locked buckets. BLOCKED, CANCELLED and
 * COMPLETED are intentionally ignored — they're neither free nor occupied.
 * When `nowIso` is passed (an ISO instant, e.g. new Date().toISOString()), an
 * AVAILABLE slot counts as free only if it hasn't started yet (startAt > now);
 * that's the "ešte voľných dnes" countdown for the day view. Comparing the two
 * fixed-format UTC ISO strings lexically is equivalent to comparing instants.
 */
export function countSlots(slots: SlotDTO[], nowIso?: string): SlotCountsDTO {
  let available = 0;
  let booked = 0;
  let locked = 0;
  for (const s of slots) {
    if (s.status === "AVAILABLE") {
      if (nowIso === undefined || s.startAt > nowIso) available++;
    } else if (s.status === "BOOKED") booked++;
    else if (s.status === "LOCKED") locked++;
  }
  return { available, booked, locked };
}

export interface TypeAvail {
  free: number;
  total: number;
}

/**
 * Break down slots by their appointment kind (akútne / dispenzárne / echo /
 * iné), reporting both the free count and the total bookable capacity
 * (AVAILABLE + BOOKED) per kind. When `nowIso` is passed, slots that have
 * already started are excluded from `free` (so day-view "ešte voľných" matches),
 * but `total` always reflects the period's full capacity.
 * PRE_HOSPITAL and ACUTE_RESERVE both roll up under "akútne"; bookable CUSTOM
 * slots roll up under "iné". The four `free` buckets sum to countSlots().available.
 */
export function availByType(
  slots: SlotDTO[],
  nowIso?: string,
): { akut: TypeAvail; disp: TypeAvail; echo: TypeAvail; custom: TypeAvail } {
  const mk = (): TypeAvail => ({ free: 0, total: 0 });
  const r = { akut: mk(), disp: mk(), echo: mk(), custom: mk() };
  for (const s of slots) {
    if (s.status !== "AVAILABLE" && s.status !== "BOOKED") continue;
    const kind =
      s.appointmentType === "PRE_HOSPITAL" || s.appointmentType === "ACUTE_RESERVE"
        ? "akut"
        : s.appointmentType === "DISPENSARY"
          ? "disp"
          : s.appointmentType === "ECHO"
            ? "echo"
            : "custom";
    r[kind].total++;
    if (s.status === "AVAILABLE" && (nowIso === undefined || s.startAt > nowIso))
      r[kind].free++;
  }
  return r;
}
