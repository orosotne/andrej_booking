import type { AppointmentTypeLit, ColorKey } from "./types";

// A policy key references a named ReleasePolicy seeded in the DB. The pure
// template only carries the key; generate.ts resolves it to a real policy.
export type PolicyKey =
  | "PRE_HOSPITAL_5D"
  | "PRE_HOSPITAL_12D"
  | "IMMEDIATE"
  | "DISPENSARY_32D"
  | "DISPENSARY_93D"
  | "ECHO_13D"
  | "BLOCKED";

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

// Canonical clinic day (v2 layout). Seeds slot_rules; admins can edit rules in DB.
// Each BlockDef becomes one SlotRule row; generate.ts expands it into AppointmentSlots.
//
// Day shape — v otvorených dňoch sú voľné hneď (14 mesiacov popredu) len
// 9:00–11:00 a ECHO 13:30–14:40; ostatné bookable sloty sa otvárajú vo vlastnom okne:
//   7:00        PRE_HOSPITAL (predhospitalizačné) — otvorí sa 5 dní predtým
//   7:30        PRE_HOSPITAL (predhospitalizačné) — otvorí sa 12 dní predtým
//   8:00, 8:30  Porada — manual only (locked, grey)
//   9:00–11:00  Dispenzár — voľné hneď (14 mesiacov popredu), 30-min sloty
//   11:30       Dispenzár — otvorí sa 32 dní predtým
//   12:00       Dispenzár — otvorí sa 93 dní predtým
//  12:30, 13:00 ECHO oddelenie — manual only (locked, dark blue)
//  13:30, 13:50, 14:10, 14:40 — ECHO bookable, voľné hneď (4 sloty po 20 min)
//                (od 1.2.2027 sú 13:30/13:50/14:10 blokované — otvorenie len
//                 heslom, žlté s vodotlačou PENTA; pozri isPasswordOnlySlot
//                 v release-rules.ts)
//  15:00        ECHO bookable — otvorí sa 13 dní predtým
export const DEFAULT_DAY_BLOCKS: BlockDef[] = [
  {
    start: "07:00",
    end: "07:30",
    type: "PRE_HOSPITAL",
    colorKey: "pink",
    policyKey: "PRE_HOSPITAL_5D",
    bookable: true,
  },
  {
    start: "07:30",
    end: "08:00",
    type: "PRE_HOSPITAL",
    colorKey: "pink",
    policyKey: "PRE_HOSPITAL_12D",
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
    policyKey: "DISPENSARY_32D",
    bookable: true,
  },
  {
    start: "12:00",
    end: "12:30",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "DISPENSARY_93D",
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
export function buildDayTemplate(): SlotDef[] {
  const slots: SlotDef[] = [];
  for (const b of DEFAULT_DAY_BLOCKS) {
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
