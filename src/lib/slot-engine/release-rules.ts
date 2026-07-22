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
// function pure and timezone-free.
function atSixUtc(d: Date): Date {
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
    case "LAST_FRIDAY_30_DAYS_BEFORE":
      return isLastFriday ? atSixUtc(subDaysUtc(slotDate, 30)) : null;
  }
}

// From 1 Feb 2027 the ECHO slots starting 13:30, 13:50 and 14:10 are blocked:
// they generate as LOCKED with no release time (MANUAL_ONLY), the release cron
// never opens them, and staff can open one only through the password-gated
// unlock dialog. Keyed by calendar-day date + wall-clock start time so that
// generation, template re-apply and the backfill script
// (prisma/block-echo-1330-1410-feb2027.ts) all agree. Slots booked before the
// cutover are never touched — those guards live in the callers (diffDaySlots
// skips booked slots; the script skips BOOKED/COMPLETED).
export const PASSWORD_ONLY_FROM = new Date(Date.UTC(2027, 1, 1)); // 2027-02-01
export const PASSWORD_ONLY_TIMES: readonly string[] = ["13:30", "13:50", "14:10"];

/** True when the slot at `startHhmm` on `dayDate` (@db.Date, midnight UTC) is password-only. */
export function isPasswordOnlySlot(dayDate: Date, startHhmm: string): boolean {
  return (
    dayDate.getTime() >= PASSWORD_ONLY_FROM.getTime() &&
    PASSWORD_ONLY_TIMES.includes(startHhmm)
  );
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
