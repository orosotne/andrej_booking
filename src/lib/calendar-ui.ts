import { dateOnly, isLastFridayOfMonth } from "./calendar-date";
import { isoAddDays, monthOf, startOfMonth, startOfWeek } from "./format";
import { holidayName } from "./holidays-sk";
import type { CalendarDayDTO, SlotDTO, SlotCountsDTO } from "./api-types";
import type { AppointmentTypeLit } from "./slot-engine/types";

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

/**
 * Title + description of the password dialog that opens a protected day
 * (streda, posledný piatok v mesiaci, sviatok). Shared by the month and day
 * views so both stay in sync. A Wednesday / last Friday opened this way
 * releases all its slots at once — the description says so, because that is
 * exactly what the password buys (see expandTemplateRules, manuallyOpened).
 */
export function openDayPasswordText(iso: string): {
  title: string;
  description: string;
} {
  const dow = weekdayOf(iso);
  const isWednesday = dow === 3;
  const isLastFri = dow === 5 && isLastFridayOfMonth(dateOnly(iso));
  const holiday = holidayName(iso);
  const base = holiday
    ? `Tento deň je sviatok (${holiday}). Otvorenie je výnimočné — zadajte heslo.`
    : "Tento deň je chránený. Zadajte heslo pre otvorenie.";
  return {
    title: isWednesday
      ? "Otvoriť stredu"
      : isLastFri
        ? "Otvoriť posledný piatok v mesiaci"
        : "Otvoriť deň",
    description:
      isWednesday || isLastFri
        ? `${base} Sloty budú voľné hneď, bez časových obmedzení.`
        : base,
  };
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

/** The bookable kinds a slot type rolls up to in the calendar UI. */
export type BookableKind = "akut" | "disp" | "echo" | "custom";

/**
 * Slot type → the bucket the calendar UI reports it under. PRE_HOSPITAL and
 * ACUTE_RESERVE both roll up under "akútne"; the blocked types (porada, ECHO
 * oddelenie) and CUSTOM land in "custom", which every caller either reports as
 * "iné" or drops.
 */
function bookableKind(type: AppointmentTypeLit): BookableKind {
  if (type === "PRE_HOSPITAL" || type === "ACUTE_RESERVE") return "akut";
  if (type === "DISPENSARY") return "disp";
  if (type === "ECHO") return "echo";
  return "custom";
}

/**
 * True for the password-only ECHO slots (13:30/13:50/14:10 from Feb 2027),
 * which carry the dedicated "yellow" colour and render with the PENTA
 * watermark. The type stays ECHO, so colour is the only discriminator.
 */
export function isPentaSlot(slot: { color: string }): boolean {
  return slot.color === "yellow";
}

/**
 * Break down slots by their appointment kind (akútne / dispenzárne / echo /
 * iné), reporting both the free count and the total bookable capacity
 * (AVAILABLE + BOOKED) per kind. When `nowIso` is passed, slots that have
 * already started are excluded from `free` (so day-view "ešte voľných" matches),
 * but `total` always reflects the period's full capacity.
 * PRE_HOSPITAL and ACUTE_RESERVE both roll up under "akútne"; bookable CUSTOM
 * slots roll up under "iné". The four `free` buckets sum to countSlots().available.
 * PENTA slots are NOT excluded here — the summary strip reports total echo
 * capacity; only the month cells apply that rule (see tallyDayByType).
 */
export function availByType(
  slots: SlotDTO[],
  nowIso?: string,
): { akut: TypeAvail; disp: TypeAvail; echo: TypeAvail; custom: TypeAvail } {
  const mk = (): TypeAvail => ({ free: 0, total: 0 });
  const r = { akut: mk(), disp: mk(), echo: mk(), custom: mk() };
  for (const s of slots) {
    if (s.status !== "AVAILABLE" && s.status !== "BOOKED") continue;
    const kind = bookableKind(s.appointmentType);
    r[kind].total++;
    if (s.status === "AVAILABLE" && (nowIso === undefined || s.startAt > nowIso))
      r[kind].free++;
  }
  return r;
}

export interface TypeTally {
  free: number;
  locked: number;
  booked: number;
}

/**
 * Per-type free / locked / booked counts for one day, as shown in a month cell.
 * Two rules the summary strip does NOT apply:
 *   - "iné" (CUSTOM and the blocked types) is dropped entirely — the cell has
 *     exactly three rows,
 *   - PENTA slots (ECHO + yellow) are excluded from all three counters, because
 *     the echo row means plain echo only: neither ECHO oddelenie nor PENTA.
 * BLOCKED / CANCELLED / COMPLETED slots are ignored, matching countSlots.
 */
export function tallyDayByType(slots: SlotDTO[]): {
  akut: TypeTally;
  disp: TypeTally;
  echo: TypeTally;
} {
  const mk = (): TypeTally => ({ free: 0, locked: 0, booked: 0 });
  const r = { akut: mk(), disp: mk(), echo: mk() };
  for (const s of slots) {
    if (s.status !== "AVAILABLE" && s.status !== "LOCKED" && s.status !== "BOOKED")
      continue;
    const kind = bookableKind(s.appointmentType);
    if (kind === "custom") continue;
    if (kind === "echo" && isPentaSlot(s)) continue;
    if (s.status === "AVAILABLE") r[kind].free++;
    else if (s.status === "LOCKED") r[kind].locked++;
    else r[kind].booked++;
  }
  return r;
}

/**
 * The Wed/Thu/Fri cells of one month grid, in render order — always a multiple
 * of 3, with position % 3 giving 0 = Wed, 1 = Thu, 2 = Fri.
 *
 * Only the anchor's own month is shown. A week made entirely of neighbouring
 * months is dropped (with fixed cell aspect ratios such a row is ~180px of
 * nothing), but a stray day inside a kept week comes back as `null` rather than
 * being removed: the grid fills left to right, so dropping it outright would
 * pull the next day into the wrong weekday column.
 */
export function monthGridCells(anchorIso: string): (string | null)[] {
  const month = monthOf(anchorIso);
  // Anchor on the 1st, not on the given day: a mid-month anchor would otherwise
  // start the grid at that week and silently drop the earlier days.
  const gridStart = startOfWeek(startOfMonth(anchorIso));
  return Array.from({ length: 6 }, (_, w) =>
    [2, 3, 4].map((d) => isoAddDays(gridStart, w * 7 + d)),
  )
    .filter((week) => week.some((iso) => monthOf(iso) === month))
    .flat()
    .map((iso) => (monthOf(iso) === month ? iso : null));
}
