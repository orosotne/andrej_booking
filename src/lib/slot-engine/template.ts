import type { AppointmentTypeLit, ColorKey } from "./types";

// A policy key references a named ReleasePolicy seeded in the DB. The pure
// template only carries the key; generate.ts resolves it to a real policy.
export type PolicyKey =
  | "PRE_HOSPITAL"
  | "DISPENSARY"
  | "ECHO"
  | "ACUTE_RESERVE"
  | "BLOCKED";

export interface BlockDef {
  start: string; // "HH:MM" wall clock
  end: string;
  type: AppointmentTypeLit;
  colorKey: ColorKey;
  policyKey: PolicyKey;
  bookable: boolean;
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

// Canonical clinic day. This is the DEFAULT used to seed slot_rules; once
// seeded, admins edit the rules in the DB and generation reads from there.
export const DEFAULT_DAY_BLOCKS: BlockDef[] = [
  {
    start: "07:00",
    end: "08:00",
    type: "PRE_HOSPITAL",
    colorKey: "pink",
    policyKey: "PRE_HOSPITAL",
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
    end: "12:30",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "DISPENSARY",
    bookable: true,
  },
  {
    start: "12:30",
    end: "14:30",
    type: "ECHO",
    colorKey: "blue",
    policyKey: "ECHO",
    bookable: true,
  },
  {
    start: "14:30",
    end: "15:00",
    type: "DISPENSARY",
    colorKey: "white",
    policyKey: "DISPENSARY",
    bookable: true,
  },
  {
    start: "15:00",
    end: "15:30",
    type: "ACUTE_RESERVE",
    colorKey: "orange",
    policyKey: "ACUTE_RESERVE",
    bookable: true,
  },
];

const EXTRA_LATE_BLOCK: BlockDef = {
  start: "15:30",
  end: "16:00",
  type: "DISPENSARY",
  colorKey: "white",
  policyKey: "DISPENSARY",
  bookable: true,
};

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Expands the day's blocks into individual 30-minute slot definitions. */
export function buildDayTemplate(opts?: { extraLateSlot?: boolean }): SlotDef[] {
  const blocks = opts?.extraLateSlot
    ? [...DEFAULT_DAY_BLOCKS, EXTRA_LATE_BLOCK]
    : DEFAULT_DAY_BLOCKS;

  const slots: SlotDef[] = [];
  for (const b of blocks) {
    for (let m = hhmmToMin(b.start); m < hhmmToMin(b.end); m += SLOT_MINUTES) {
      slots.push({
        start: minToHhmm(m),
        end: minToHhmm(m + SLOT_MINUTES),
        type: b.type,
        colorKey: b.colorKey,
        policyKey: b.policyKey,
        bookable: b.bookable,
      });
    }
  }
  return slots.sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
}
