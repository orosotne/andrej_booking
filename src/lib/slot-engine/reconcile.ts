import { isLastFridayOfMonth } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { hhmmToMin, minToHhmm, SLOT_MINUTES } from "./template";
import {
  computeReleaseAt,
  initialSlotStatus,
  isPasswordOnlySlot,
} from "./release-rules";
import type { AppointmentTypeLit, ReleasePolicyInput, SlotStatusLit } from "./types";

// Pure slot-reconciliation logic, kept dependency-free (no Prisma) so it can be
// unit-tested without a DB — same split as release-rules.ts vs generate.ts.

interface PolicyRow {
  releaseType: string;
  daysBefore: number | null;
  monthsBefore?: number | null;
}

/** A template's slot rule, reduced to what slot generation needs. */
export interface RuleForExpansion {
  id: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  appointmentType: AppointmentTypeLit;
  color: string;
  releasePolicy: PolicyRow | null;
}

/** Extra context about the day being expanded (beyond its date). */
export interface ExpandOptions {
  /**
   * The day was opened by hand through the password gate — a Wednesday or the
   * last Friday of the month. Such a day is an extra clinic day the manager
   * deliberately opens, so its bookable slots carry no release window at all:
   * they are AVAILABLE from generation instead of waiting out their policy
   * (30 days for a last Friday, up to 6 months for dispenzár blocks).
   */
  manuallyOpened?: boolean;
}

/**
 * True when a calendar day was opened by hand behind the password gate. Both
 * conditions matter: the day type alone is not enough (every Wednesday and
 * last Friday carries it by default, see defaultDayType), and openedByUserId
 * alone is not either (a holiday Thu/Fri may also be opened manually, and it
 * keeps its normal release windows).
 */
export function isManuallyOpenedDay(day: {
  dayType: string;
  openedByUserId: string | null;
}): boolean {
  return (
    day.openedByUserId !== null &&
    (day.dayType === "MANUAL_WEDNESDAY" || day.dayType === "LAST_FRIDAY")
  );
}

/** A concrete slot a calendar day should contain (minus its calendarDayId). */
export interface DesiredSlot {
  startAt: Date;
  endAt: Date;
  appointmentType: AppointmentTypeLit;
  status: SlotStatusLit;
  releaseAt: Date | null;
  color: string;
  ruleId: string;
}

/** Maps a DB ReleasePolicy row to the pure engine's policy input. */
function toPolicyInput(policy: PolicyRow | null): ReleasePolicyInput {
  if (!policy) return { type: "MANUAL_ONLY" }; // no policy → stay locked (safe default)
  switch (policy.releaseType) {
    case "IMMEDIATE":
      return { type: "IMMEDIATE" };
    case "DAYS_BEFORE":
      return { type: "DAYS_BEFORE", daysBefore: policy.daysBefore ?? 0 };
    case "MONTHS_BEFORE":
      // A months policy with no value would silently mean "opens immediately",
      // which is the unsafe direction — fall through to MANUAL_ONLY instead.
      return policy.monthsBefore == null
        ? { type: "MANUAL_ONLY" }
        : { type: "MONTHS_BEFORE", monthsBefore: policy.monthsBefore };
    case "LAST_FRIDAY_30_DAYS_BEFORE":
      return { type: "LAST_FRIDAY_30_DAYS_BEFORE" };
    case "MANUAL_ONLY":
    default:
      return { type: "MANUAL_ONLY" };
  }
}

/**
 * Expands a rule's [startTime, endTime] block into sub-slots of the rule's
 * configured duration (default 30 min). The rule is the smallest unit for
 * irregular ECHO timings — each non-uniform slot is its own SlotRule row.
 */
function expandRule(
  startTime: string,
  endTime: string,
  durationMinutes: number,
): { start: string; end: string }[] {
  const dur = durationMinutes > 0 ? durationMinutes : SLOT_MINUTES;
  const out: { start: string; end: string }[] = [];
  for (let m = hhmmToMin(startTime); m + dur <= hhmmToMin(endTime); m += dur) {
    out.push({ start: minToHhmm(m), end: minToHhmm(m + dur) });
  }
  return out;
}

/**
 * Expands a template's slot rules into the concrete slots a given calendar day
 * should contain. Pure: same inputs → same slots, so a day reconciled here is
 * byte-identical to one produced by generateDay (which delegates to this).
 *
 * Two overrides sit above the rules' own policies, both limited to bookable
 * slots (blocked types stay blocked either way):
 *   - a manually opened day (Wednesday / last Friday, opts.manuallyOpened)
 *     drops every release window — the slots open right away,
 *   - otherwise a last Friday uses the last-Friday policy for every slot.
 */
export function expandTemplateRules(
  rules: RuleForExpansion[],
  date: Date,
  now: Date,
  opts: ExpandOptions = {},
): DesiredSlot[] {
  const lastFri = isLastFridayOfMonth(date);
  return rules.flatMap((rule) => {
    const isLocked =
      rule.appointmentType === "CONSULTATION_BLOCKED" ||
      rule.appointmentType === "ECHO_DEPARTMENT_BLOCKED";
    const policyInput: ReleasePolicyInput = isLocked
      ? toPolicyInput(rule.releasePolicy)
      : opts.manuallyOpened
        ? { type: "IMMEDIATE" }
        : lastFri
          ? { type: "LAST_FRIDAY_30_DAYS_BEFORE" }
          : toPolicyInput(rule.releasePolicy);

    return expandRule(rule.startTime, rule.endTime, rule.slotDurationMinutes).map((s) => {
      // Password-only slots (13:30/13:50/14:10 from Feb 2027) trump every
      // policy, including the last-Friday and manually-opened overrides: LOCKED
      // until a per-slot password unlock, never released automatically — those
      // are reserved capacity, not a time window. They also carry the dedicated
      // "yellow" colour, which the UI renders with the PENTA watermark.
      const passwordOnly = isPasswordOnlySlot(date, s.start);
      const slotPolicy: ReleasePolicyInput = passwordOnly
        ? { type: "MANUAL_ONLY" }
        : policyInput;
      const releaseAt = computeReleaseAt(date, slotPolicy, lastFri);
      return {
        startAt: wallClockToUtc(date, s.start),
        endAt: wallClockToUtc(date, s.end),
        appointmentType: rule.appointmentType,
        status: initialSlotStatus(rule.appointmentType, releaseAt, now),
        releaseAt,
        color: passwordOnly ? "yellow" : rule.color,
        ruleId: rule.id,
      };
    });
  });
}

/** An existing DB slot, reduced to what reconciliation needs. */
export interface ExistingSlot {
  id: string;
  startAt: Date;
  hasActiveAppointment: boolean;
  // Current attributes, so a block that changed but kept the same start time
  // (a release-rule, type, or colour edit) can be refreshed in place rather
  // than left stale. manualLock guards the manual-lock feature from being
  // undone by a template re-apply.
  manualLock: boolean;
  appointmentType: AppointmentTypeLit;
  status: SlotStatusLit;
  releaseAt: Date | null;
  color: string;
}

/** An in-place attribute refresh for a matched, free (unbooked) slot. */
export interface SlotUpdate {
  id: string;
  appointmentType: AppointmentTypeLit;
  status: SlotStatusLit;
  releaseAt: Date | null;
  color: string;
}

export interface DayDiff {
  toCreate: DesiredSlot[];
  toUpdate: SlotUpdate[];
  toDeleteIds: string[];
  keptBooked: number;
}

/**
 * Reconciles one day's existing slots against the template's desired slots,
 * keyed by start instant:
 *   - desired & missing        → create
 *   - existing & not desired    → delete, UNLESS it has an active appointment
 *                                 (booked slots are never touched, only counted)
 *   - present in both           → refresh the slot's attributes (type, colour,
 *                                 release time/status) IN PLACE when the rule
 *                                 changed without moving the start time.
 *
 * A slot is only refreshed when it is genuinely free to reshape: booked and
 * manually-locked slots are skipped (a template edit must never move a patient
 * or lift a manual lock), and only AVAILABLE/LOCKED slots are eligible — a
 * BLOCKED slot may be a closed (vacation) day, which a re-apply must not reopen.
 */
export function diffDaySlots(
  desired: DesiredSlot[],
  existing: ExistingSlot[],
): DayDiff {
  const desiredByStart = new Map(desired.map((d) => [d.startAt.getTime(), d]));
  const existingStarts = new Set(existing.map((e) => e.startAt.getTime()));

  const toCreate = desired.filter((d) => !existingStarts.has(d.startAt.getTime()));

  const toUpdate: SlotUpdate[] = [];
  const toDeleteIds: string[] = [];
  let keptBooked = 0;
  for (const e of existing) {
    const want = desiredByStart.get(e.startAt.getTime());
    if (!want) {
      // no longer in the template → delete, unless booked
      if (e.hasActiveAppointment) keptBooked++; // booked → never delete
      else toDeleteIds.push(e.id);
      continue;
    }
    // Matched. Only refresh free, schedulable slots.
    if (e.hasActiveAppointment || e.manualLock) continue;
    if (e.status !== "AVAILABLE" && e.status !== "LOCKED") continue;
    const changed =
      e.appointmentType !== want.appointmentType ||
      e.color !== want.color ||
      e.status !== want.status ||
      (e.releaseAt?.getTime() ?? null) !== (want.releaseAt?.getTime() ?? null);
    if (changed) {
      toUpdate.push({
        id: e.id,
        appointmentType: want.appointmentType,
        status: want.status,
        releaseAt: want.releaseAt,
        color: want.color,
      });
    }
  }

  return { toCreate, toUpdate, toDeleteIds, keptBooked };
}
