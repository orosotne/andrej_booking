import { SCHEDULE_2028_FROM, WEEKDAY } from "@/lib/calendar-date";
import type { RuleForExpansion } from "./reconcile";
import type { AppointmentTypeLit, ColorKey, ReleaseTypeLit } from "./types";

// A policy key references a named ReleasePolicy seeded in the DB. The pure
// template only carries the key; generate.ts resolves it to a real policy.
export type PolicyKey =
  | "PRE_HOSPITAL_14D"
  | "PRE_HOSPITAL_21D"
  | "IMMEDIATE"
  | "DISPENSARY_9_7M"
  | "DISPENSARY_1130_7M"
  | "DISPENSARY_12_3M"
  | "DISPENSARY_12_1M"
  | "ECHO_13D"
  | "BLOCKED"
  // Okná štvrtka a piatka od 1. 1. 2028 (pozri BLOCKS_2028).
  | "Y2028_ACUTE_700_21D"
  | "Y2028_ACUTE_730_14D"
  | "Y2028_DISPENSARY_900_THU_3M"
  | "Y2028_DISPENSARY_900_FRI_45D"
  | "Y2028_DISPENSARY_1100_7M"
  | "Y2028_ECHO_1500_1M";

export interface PolicyDef {
  name: string;
  releaseType: ReleaseTypeLit;
  daysBefore?: number;
  monthsBefore?: number;
}

/**
 * Seed values of every release policy. Admins can change the numbers later in
 * Nastavenia, so the live DB may differ — never read a live value from here.
 */
export const POLICY_DEFS: Record<PolicyKey, PolicyDef> = {
  PRE_HOSPITAL_14D: { name: "Predhospitalizačné 7:00 (14 dní)", releaseType: "DAYS_BEFORE", daysBefore: 14 },
  PRE_HOSPITAL_21D: { name: "Predhospitalizačné 7:30 (21 dní)", releaseType: "DAYS_BEFORE", daysBefore: 21 },
  IMMEDIATE: { name: "Voľné hneď (14 mesiacov popredu)", releaseType: "IMMEDIATE" },
  DISPENSARY_9_7M: { name: "Dispenzár 9:00–9:30 (7 mesiacov)", releaseType: "MONTHS_BEFORE", monthsBefore: 7 },
  DISPENSARY_1130_7M: { name: "Dispenzár 11:30 (7 mesiacov)", releaseType: "MONTHS_BEFORE", monthsBefore: 7 },
  DISPENSARY_12_3M: { name: "Dispenzár 12:00 štvrtok (3 mesiace)", releaseType: "MONTHS_BEFORE", monthsBefore: 3 },
  DISPENSARY_12_1M: { name: "Dispenzár 12:00 piatok (1 mesiac)", releaseType: "MONTHS_BEFORE", monthsBefore: 1 },
  ECHO_13D: { name: "ECHO 15:00 (13 dní)", releaseType: "DAYS_BEFORE", daysBefore: 13 },
  BLOCKED: { name: "Blokované (Porada / ECHO oddelenie)", releaseType: "MANUAL_ONLY" },
  Y2028_ACUTE_700_21D: { name: "2028 · Akútne 7:00 (3 týždne)", releaseType: "DAYS_BEFORE", daysBefore: 21 },
  Y2028_ACUTE_730_14D: { name: "2028 · Akútne 7:30 (2 týždne)", releaseType: "DAYS_BEFORE", daysBefore: 14 },
  Y2028_DISPENSARY_900_THU_3M: { name: "2028 · Dispenzár 9:00 štvrtok (3 mesiace)", releaseType: "MONTHS_BEFORE", monthsBefore: 3 },
  Y2028_DISPENSARY_900_FRI_45D: { name: "2028 · Dispenzár 9:00 piatok (1,5 mesiaca)", releaseType: "DAYS_BEFORE", daysBefore: 45 },
  Y2028_DISPENSARY_1100_7M: { name: "2028 · Dispenzár 11:00–12:00 (7 mesiacov)", releaseType: "MONTHS_BEFORE", monthsBefore: 7 },
  Y2028_ECHO_1500_1M: { name: "2028 · ECHO 15:00 (1 mesiac)", releaseType: "MONTHS_BEFORE", monthsBefore: 1 },
};

export interface BlockDef {
  start: string; // "HH:MM" wall clock
  end: string;
  type: AppointmentTypeLit;
  colorKey: ColorKey;
  policyKey: PolicyKey;
  bookable: boolean;
  slotDurationMinutes?: number; // defaults to SLOT_MINUTES (30)
}

export interface SlotDef {
  start: string;
  end: string;
  type: AppointmentTypeLit;
  colorKey: ColorKey;
  policyKey: PolicyKey;
  bookable: boolean;
}

export const SLOT_MINUTES = 30;

// Canonical clinic day (v2 layout) — štvrtok a piatok do 31. 12. 2027 (od 2028
// platí BLOCKS_2028, pozri TEMPLATE_VERSIONS). Seeds slot_rules; admins can
// edit rules in DB. Each BlockDef becomes one SlotRule row; generate.ts expands
// it into AppointmentSlots.
//
// Day shape — v otvorených dňoch sú voľné hneď (14 mesiacov popredu) len
// 10:00–11:00 a ECHO 13:30–14:40; ostatné bookable sloty sa otvárajú vo vlastnom okne:
//   7:00        PRE_HOSPITAL (predhospitalizačné) — otvorí sa 14 dní (2 týždne) predtým
//   7:30        PRE_HOSPITAL (predhospitalizačné) — otvorí sa 21 dní (3 týždne) predtým
//   8:00, 8:30  Porada — manual only (locked, grey)
//   9:00, 9:30  Dispenzár — otvorí sa presne 7 mesiacov predtým
//   10:00–11:00 Dispenzár — voľné hneď (14 mesiacov popredu), 30-min sloty
//   11:30       Dispenzár — otvorí sa presne 7 mesiacov predtým
//   12:00       Dispenzár — okno závisí od dňa v týždni (pozri dayBlocksFor):
//               štvrtok 3 mesiace, piatok 1 mesiac predtým
//  12:30, 13:00 ECHO oddelenie — manual only (locked, dark blue)
//  13:30, 13:50, 14:10, 14:40 — ECHO bookable, voľné hneď (4 sloty po 20 min)
//                (od 1.2.2027 sú 13:30/13:50/14:10 ECHO PENTA — žlté s vodotlačou
//                 PENTA, otvoria sa 10 dní predtým; pozri isPentaSlotTime
//                 v release-rules.ts)
//  15:00        ECHO bookable — otvorí sa 13 dní predtým
export const DEFAULT_DAY_BLOCKS: BlockDef[] = [
  {
    start: "07:00",
    end: "07:30",
    type: "PRE_HOSPITAL",
    colorKey: "pink",
    policyKey: "PRE_HOSPITAL_14D",
    bookable: true,
  },
  {
    start: "07:30",
    end: "08:00",
    type: "PRE_HOSPITAL",
    colorKey: "pink",
    policyKey: "PRE_HOSPITAL_21D",
    bookable: true,
  },
  {
    start: "08:00",
    end: "09:00",
    type: "CONSULTATION_BLOCKED",
    colorKey: "grey",
    policyKey: "BLOCKED",
    bookable: false,
  },
  {
    start: "09:00",
    end: "10:00",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "DISPENSARY_9_7M",
    bookable: true,
  },
  {
    start: "10:00",
    end: "11:30",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "IMMEDIATE",
    bookable: true,
  },
  {
    start: "11:30",
    end: "12:00",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "DISPENSARY_1130_7M",
    bookable: true,
  },
  {
    // Overridden per weekday by dayBlocksFor() — Friday's 12:00 opens 1 month
    // before instead of 3. This entry carries the Thursday default.
    start: "12:00",
    end: "12:30",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "DISPENSARY_12_3M",
    bookable: true,
  },
  {
    start: "12:30",
    end: "13:30",
    type: "ECHO_DEPARTMENT_BLOCKED",
    colorKey: "navy",
    policyKey: "BLOCKED",
    bookable: false,
  },
  // ECHO bookable: 5 slotov po 20 minútach, s 30-min prestávkou medzi 14:30 a 14:40.
  // Každý slot je samostatný SlotRule (umožňuje nerovnomerné rozostúpenie).
  { start: "13:30", end: "13:50", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "13:50", end: "14:10", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "14:10", end: "14:30", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "14:40", end: "15:00", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "15:00", end: "15:20", type: "ECHO", colorKey: "blue", policyKey: "ECHO_13D", bookable: true, slotDurationMinutes: 20 },
];

// Streda (mimoriadna, otvára sa heslom): celý deň dispenzár po 30 minútach,
// voľný hneď od vygenerovania, posledný slot 14:30. Zamknuté ostávajú len
// porada 8:00/8:30 a ECHO oddelenie 12:30/13:00.
export const WEDNESDAY_BLOCKS: BlockDef[] = [
  { start: "07:00", end: "08:00", type: "DISPENSARY", colorKey: "white", policyKey: "IMMEDIATE", bookable: true },
  { start: "08:00", end: "09:00", type: "CONSULTATION_BLOCKED", colorKey: "grey", policyKey: "BLOCKED", bookable: false },
  { start: "09:00", end: "12:30", type: "DISPENSARY", colorKey: "white", policyKey: "IMMEDIATE", bookable: true },
  { start: "12:30", end: "13:30", type: "ECHO_DEPARTMENT_BLOCKED", colorKey: "navy", policyKey: "BLOCKED", bookable: false },
  { start: "13:30", end: "15:00", type: "DISPENSARY", colorKey: "white", policyKey: "IMMEDIATE", bookable: true },
];

// Štvrtok od 1. 1. 2028 (piatok sa líši len v 9:00, pozri TEMPLATE_VERSIONS):
//   7:00         akútne — otvorí sa 3 týždne (21 dní) predtým
//   7:30         akútne — otvorí sa 2 týždne (14 dní) predtým
//   8:00, 8:30   porada — zamknuté
//   9:00         dispenzár — štvrtok 3 mesiace, piatok 45 dní (1,5 mesiaca) predtým
//   9:30–10:30   dispenzár — voľné hneď
//   11:00–12:00  dispenzár — otvorí sa 7 mesiacov predtým
//   12:30, 13:00 ECHO oddelenie — zamknuté
//   13:30, 13:50, 14:10 ECHO PENTA — otvorí sa 10 dní predtým (isPentaSlotTime)
//   14:40        ECHO — voľné hneď
//   15:00        ECHO — otvorí sa 1 mesiac predtým
export const BLOCKS_2028: BlockDef[] = [
  { start: "07:00", end: "07:30", type: "PRE_HOSPITAL", colorKey: "pink", policyKey: "Y2028_ACUTE_700_21D", bookable: true },
  { start: "07:30", end: "08:00", type: "PRE_HOSPITAL", colorKey: "pink", policyKey: "Y2028_ACUTE_730_14D", bookable: true },
  { start: "08:00", end: "09:00", type: "CONSULTATION_BLOCKED", colorKey: "grey", policyKey: "BLOCKED", bookable: false },
  { start: "09:00", end: "09:30", type: "DISPENSARY", colorKey: "white", policyKey: "Y2028_DISPENSARY_900_THU_3M", bookable: true },
  { start: "09:30", end: "11:00", type: "DISPENSARY", colorKey: "white", policyKey: "IMMEDIATE", bookable: true },
  { start: "11:00", end: "12:30", type: "DISPENSARY", colorKey: "white", policyKey: "Y2028_DISPENSARY_1100_7M", bookable: true },
  { start: "12:30", end: "13:30", type: "ECHO_DEPARTMENT_BLOCKED", colorKey: "navy", policyKey: "BLOCKED", bookable: false },
  { start: "13:30", end: "13:50", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "13:50", end: "14:10", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "14:10", end: "14:30", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "14:40", end: "15:00", type: "ECHO", colorKey: "blue", policyKey: "IMMEDIATE", bookable: true, slotDurationMinutes: 20 },
  { start: "15:00", end: "15:20", type: "ECHO", colorKey: "blue", policyKey: "Y2028_ECHO_1500_1M", bookable: true, slotDurationMinutes: 20 },
];

/**
 * The canonical day layout for one weekday until the end of 2027. Wednesday
 * runs its own all-dispenzár day; Friday differs from Thursday only in the
 * 12:00 dispenzár, which opens 1 month before the appointment instead of 3.
 * Callers that seed slot_rules must use this (or TEMPLATE_VERSIONS), not the
 * raw arrays.
 */
export function dayBlocksFor(dayOfWeek: number): BlockDef[] {
  if (dayOfWeek === WEEKDAY.WED) return WEDNESDAY_BLOCKS;
  if (dayOfWeek !== WEEKDAY.FRI) return DEFAULT_DAY_BLOCKS;
  return DEFAULT_DAY_BLOCKS.map((b) =>
    b.start === "12:00" && b.type === "DISPENSARY"
      ? { ...b, policyKey: "DISPENSARY_12_1M" as PolicyKey }
      : b,
  );
}

export interface TemplateVersion {
  name: string;
  dayOfWeek: number;
  /** First day the version generates (YYYY-MM-DD, inclusive); null = no start. */
  validFrom: string | null;
  /** Last day the version generates (inclusive); null = open-ended. */
  validTo: string | null;
  blocks: BlockDef[];
}

/** Last day of the pre-2028 Thursday/Friday versions (day before SCHEDULE_2028_FROM). */
const SCHEDULE_2027_TO = "2027-12-31";

/**
 * Every schedule template the clinic runs, as seeded into schedule_templates.
 * Thursday and Friday switch to the 2028 layout on SCHEDULE_2028_FROM; the
 * Wednesday layout has no end date.
 */
export const TEMPLATE_VERSIONS: TemplateVersion[] = [
  { name: "Streda (mimoriadna)", dayOfWeek: WEEKDAY.WED, validFrom: null, validTo: null, blocks: dayBlocksFor(WEEKDAY.WED) },
  { name: "Štvrtok", dayOfWeek: WEEKDAY.THU, validFrom: null, validTo: SCHEDULE_2027_TO, blocks: dayBlocksFor(WEEKDAY.THU) },
  { name: "Štvrtok od 2028", dayOfWeek: WEEKDAY.THU, validFrom: SCHEDULE_2028_FROM, validTo: null, blocks: BLOCKS_2028 },
  { name: "Piatok", dayOfWeek: WEEKDAY.FRI, validFrom: null, validTo: SCHEDULE_2027_TO, blocks: dayBlocksFor(WEEKDAY.FRI) },
  {
    name: "Piatok od 2028",
    dayOfWeek: WEEKDAY.FRI,
    validFrom: SCHEDULE_2028_FROM,
    validTo: null,
    blocks: BLOCKS_2028.map((b) =>
      b.start === "09:00" && b.type === "DISPENSARY"
        ? { ...b, policyKey: "Y2028_DISPENSARY_900_FRI_45D" as PolicyKey }
        : b,
    ),
  },
];

/**
 * A template version's blocks as the rules expandTemplateRules consumes, with
 * the seed policy values — what freshly seeded slot_rules would expand to.
 * Lets a script preview the slots of a template that is not in the DB yet.
 */
export function rulesFromBlocks(blocks: BlockDef[]): RuleForExpansion[] {
  return blocks.map((b) => {
    const policy = POLICY_DEFS[b.policyKey];
    return {
      id: `${b.start}–${b.end} ${b.type}`,
      startTime: b.start,
      endTime: b.end,
      slotDurationMinutes: b.slotDurationMinutes ?? SLOT_MINUTES,
      appointmentType: b.type,
      color: b.colorKey,
      releasePolicy: {
        releaseType: policy.releaseType,
        daysBefore: policy.daysBefore ?? null,
        monthsBefore: policy.monthsBefore ?? null,
      },
    };
  });
}

/** The fields of a schedule_templates row that decide which days it generates. */
export interface DatedTemplate {
  dayOfWeek: number;
  isActive: boolean;
  validFrom: Date | null;
  validTo: Date | null;
}

/** True when the template generates `date` (@db.Date, midnight UTC). */
export function templateAppliesTo(t: DatedTemplate, date: Date): boolean {
  return (
    t.isActive &&
    t.dayOfWeek === date.getUTCDay() &&
    (t.validFrom === null || t.validFrom.getTime() <= date.getTime()) &&
    (t.validTo === null || t.validTo.getTime() >= date.getTime())
  );
}

/**
 * The template version that generates `date`. Ranges are not supposed to
 * overlap; if they do, the version with the latest validFrom wins, so a newly
 * added version always takes over from an open-ended older one.
 */
export function pickTemplate<T extends DatedTemplate>(
  templates: T[],
  date: Date,
): T | undefined {
  let best: T | undefined;
  for (const t of templates) {
    if (!templateAppliesTo(t, date)) continue;
    const from = t.validFrom?.getTime() ?? -Infinity;
    if (!best || from > (best.validFrom?.getTime() ?? -Infinity)) best = t;
  }
  return best;
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Expands the day's blocks into individual slot definitions. */
export function buildDayTemplate(dayOfWeek: number = WEEKDAY.THU): SlotDef[] {
  const slots: SlotDef[] = [];
  for (const b of dayBlocksFor(dayOfWeek)) {
    const dur = b.slotDurationMinutes ?? SLOT_MINUTES;
    for (let m = hhmmToMin(b.start); m + dur <= hhmmToMin(b.end); m += dur) {
      slots.push({
        start: minToHhmm(m),
        end: minToHhmm(m + dur),
        type: b.type,
        colorKey: b.colorKey,
        policyKey: b.policyKey,
        bookable: b.bookable,
      });
    }
  }
  return slots.sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
}
