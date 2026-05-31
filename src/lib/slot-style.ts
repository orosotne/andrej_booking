import type { AppointmentTypeLit, SlotStatusLit } from "@/lib/slot-engine/types";

export const TYPE_META: Record<
  AppointmentTypeLit,
  { label: string; bg: string; border: string }
> = {
  PRE_HOSPITAL: {
    label: "Predhospitalizačné",
    bg: "var(--slot-prehospital)",
    border: "var(--slot-prehospital-bd)",
  },
  CONSULTATION_BLOCKED: {
    label: "Poradňa",
    bg: "var(--slot-blocked)",
    border: "var(--slot-blocked-bd)",
  },
  DISPENSARY: {
    label: "Dispenzárne",
    bg: "var(--slot-dispensary)",
    border: "var(--slot-dispensary-bd)",
  },
  ECHO: { label: "ECHO", bg: "var(--slot-echo)", border: "var(--slot-echo-bd)" },
  ACUTE_RESERVE: {
    label: "Akútna rezerva",
    bg: "var(--slot-reserve)",
    border: "var(--slot-reserve-bd)",
  },
  CUSTOM: {
    label: "Iné",
    bg: "var(--slot-dispensary)",
    border: "var(--slot-dispensary-bd)",
  },
};

export const STATUS_LABEL: Record<SlotStatusLit, string> = {
  LOCKED: "Zamknuté",
  AVAILABLE: "Voľné",
  BOOKED: "Obsadené",
  BLOCKED: "Blokované",
  CANCELLED: "Zrušené",
  COMPLETED: "Vybavené",
};

export function isBookable(status: SlotStatusLit): boolean {
  return status === "AVAILABLE";
}
