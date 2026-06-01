import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "./types";

// release_at is normalized to 06:00 UTC on the computed day. The exact hour is
// not semantically important (it is only a threshold the daily cron compares
// against now()); fixing it keeps this function pure and timezone-free.
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

/** Initial status for a freshly generated slot. */
export function initialSlotStatus(
  type: AppointmentTypeLit,
  releaseAt: Date | null,
  now: Date,
): SlotStatusLit {
  if (type === "CONSULTATION_BLOCKED") return "BLOCKED";
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
