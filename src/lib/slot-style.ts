import type {
  AppointmentTypeLit,
  AppointmentStatusLit,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

export const TYPE_META: Record<
  AppointmentTypeLit,
  { label: string; bg: string; border: string }
> = {
  PRE_HOSPITAL: {
    label: "Akútne",
    bg: "var(--slot-prehospital)",
    border: "var(--slot-prehospital-bd)",
  },
  CONSULTATION_BLOCKED: {
    label: "Porada",
    bg: "var(--slot-blocked)",
    border: "var(--slot-blocked-bd)",
  },
  DISPENSARY: {
    label: "Dispenzárne",
    bg: "var(--slot-dispensary)",
    border: "var(--slot-dispensary-bd)",
  },
  ECHO: {
    label: "ECHO",
    bg: "var(--slot-echo)",
    border: "var(--slot-echo-bd)",
  },
  ECHO_DEPARTMENT_BLOCKED: {
    label: "ECHO oddelenie",
    bg: "var(--slot-echo-dept)",
    border: "var(--slot-echo-dept-bd)",
  },
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
  LOCKED: "Voľné, dočasne uzamknuté",
  AVAILABLE: "Voľné",
  BOOKED: "Obsadené",
  BLOCKED: "Blokované",
  CANCELLED: "Zrušené",
  COMPLETED: "Vybavené",
};

export function isBookable(status: SlotStatusLit): boolean {
  return status === "AVAILABLE";
}

// Appointment status → Slovak label (capitalized, as shown in the slot popover
// and the printout). The audit log uses its own lowercase/neuter phrasing for
// inline sentences, so it intentionally does NOT share this map.
export const APPT_STATUS_LABEL: Record<AppointmentStatusLit, string> = {
  SCHEDULED: "Objednaný",
  ARRIVED: "Prišiel",
  NO_SHOW: "Neprišiel",
  CANCELLED: "Zrušený",
  RESCHEDULED: "Presunutý",
  COMPLETED: "Vybavený",
};

/** Appointment status → label, falling back to the raw value for unknowns. */
export function apptStatusLabel(status: string): string {
  return APPT_STATUS_LABEL[status as AppointmentStatusLit] ?? status;
}
