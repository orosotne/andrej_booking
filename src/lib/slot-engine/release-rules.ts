import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "./types";

// release_at is normalized to 06:00 UTC on the computed day. This hour IS a
// contract: the daily release cron (vercel.json) must run strictly AFTER it,
// otherwise a slot whose release_at falls on day D is only picked up by the
// next day's run and opens one day late. Cron is set to 07:00 UTC to clear
// this threshold with a margin. Keeping the hour fixed in UTC also keeps this
// function pure and timezone-free. Exported because manual locks with an
// auto-unlock date (lockSlot's `until`) stamp release_at with the same
// convention, so the same cron opens them.
export function atSixUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0),
  );
}

function subDaysUtc(d: Date, n: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n),
  );
}

/**
 * `n` whole calendar months back, keeping the day of month. The day is clamped
 * to the target month's length so 31 Aug − 6 months is 28/29 Feb rather than
 * rolling forward into March, which is what a plain Date.UTC() would do.
 */
function subMonthsUtc(d: Date, n: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  // Day 0 of the month after the target = last day of the target month.
  const lastDay = new Date(Date.UTC(year, month - n + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month - n, Math.min(d.getUTCDate(), lastDay)),
  );
}

/**
 * When a slot on `slotDate` becomes bookable, per its release policy.
 * Returns null when the slot must stay LOCKED until a manual unlock
 * (MANUAL_ONLY, or LAST_FRIDAY policy on a day that is not a last Friday).
 */
export function computeReleaseAt(
  slotDate: Date,
  policy: ReleasePolicyInput,
  isLastFriday: boolean,
): Date | null {
  switch (policy.type) {
    case "IMMEDIATE":
      return new Date(0); // epoch: always <= now → opens on generation
    case "MANUAL_ONLY":
      return null;
    case "DAYS_BEFORE":
      return atSixUtc(subDaysUtc(slotDate, policy.daysBefore));
    case "MONTHS_BEFORE":
      return atSixUtc(subMonthsUtc(slotDate, policy.monthsBefore));
    case "LAST_FRIDAY_30_DAYS_BEFORE":
      return isLastFriday ? atSixUtc(subDaysUtc(slotDate, 30)) : null;
  }
}

// ECHO PENTA: from 1 Feb 2027 the ECHO slots starting 13:30, 13:50 and 14:10
// are reserved PENTA capacity — yellow, with the PENTA watermark. They used to
// be password-only (LOCKED with no release time, opened one by one through the
// unlock dialog); since 2026-10-24 every PENTA slot opens by itself
// PENTA_RELEASE_DAYS_BEFORE days before its date, picked up by the regular
// release cron like any DAYS_BEFORE policy. Keyed by calendar-day date +
// wall-clock start time so that generation, template re-apply and the backfill
// script (prisma/penta-release-10d.ts) all agree. Slots booked before the
// cutover are never touched — those guards live in the callers (diffDaySlots
// skips booked slots; the script skips BOOKED/COMPLETED). The ECHO-type check
// lives in the caller too (expandTemplateRules): a dispenzár slot at 13:30, as
// on a Wednesday, is not a PENTA slot.
export const PENTA_FROM = new Date(Date.UTC(2027, 1, 1)); // 2027-02-01
export const PENTA_TIMES: readonly string[] = ["13:30", "13:50", "14:10"];
export const PENTA_RELEASE_DAYS_BEFORE = 10;

/** The release window every PENTA slot gets, whatever its rule or day says. */
export const PENTA_POLICY: ReleasePolicyInput = {
  type: "DAYS_BEFORE",
  daysBefore: PENTA_RELEASE_DAYS_BEFORE,
};

/** True when the ECHO slot at `startHhmm` on `dayDate` (@db.Date, midnight UTC) is a PENTA slot. */
export function isPentaSlotTime(dayDate: Date, startHhmm: string): boolean {
  return (
    dayDate.getTime() >= PENTA_FROM.getTime() && PENTA_TIMES.includes(startHhmm)
  );
}

/** When a PENTA slot on `dayDate` opens: 06:00 UTC, PENTA_RELEASE_DAYS_BEFORE days earlier. */
export function pentaReleaseAt(dayDate: Date): Date {
  return atSixUtc(subDaysUtc(dayDate, PENTA_RELEASE_DAYS_BEFORE));
}

/** Initial status for a freshly generated slot. */
export function initialSlotStatus(
  type: AppointmentTypeLit,
  releaseAt: Date | null,
  now: Date,
): SlotStatusLit {
  if (type === "CONSULTATION_BLOCKED" || type === "ECHO_DEPARTMENT_BLOCKED")
    return "BLOCKED";
  if (releaseAt !== null && releaseAt.getTime() <= now.getTime())
    return "AVAILABLE";
  return "LOCKED";
}

interface ReopenSlot {
  id: string;
  appointmentType: AppointmentTypeLit;
  releaseAt: Date | null;
  status: SlotStatusLit;
}

/**
 * Reverses a close: of the slots a close turned BLOCKED, decides which become
 * bookable again (release_at passed) versus LOCKED (not yet released). Slots
 * blocked by rule (CONSULTATION_BLOCKED) recompute to BLOCKED and are omitted;
 * non-blocked slots (e.g. BOOKED appointments) are left untouched.
 */
export function partitionReopenSlots(
  slots: ReopenSlot[],
  now: Date,
): { toAvailable: string[]; toLocked: string[] } {
  const toAvailable: string[] = [];
  const toLocked: string[] = [];
  for (const s of slots) {
    if (s.status !== "BLOCKED") continue;
    const next = initialSlotStatus(s.appointmentType, s.releaseAt, now);
    if (next === "AVAILABLE") toAvailable.push(s.id);
    else if (next === "LOCKED") toLocked.push(s.id);
  }
  return { toAvailable, toLocked };
}
