import type {
  AppointmentTypeLit,
  ColorKey,
  SlotStatusLit,
} from "./slot-engine/types";
import { pentaReleaseAt } from "./slot-engine/release-rules";

/**
 * The "určenie" (designation) a staff member can pick for a single slot.
 *
 * These are NOT the AppointmentType enum: "echo penta" is a pseudo-designation
 * that resolves to ECHO + the dedicated yellow colour, because the yellow
 * PENTA ECHO slots (13:30/13:50/14:10 from Feb 2027) are distinguished by
 * colour alone. Sending a designation over the wire rather than a raw
 * {appointmentType, color} pair is what stops a client from producing nonsense
 * like a yellow DISPENSARY slot, which the UI would render with a PENTA
 * watermark while booking it as a dispenzár.
 */
export const SLOT_DESIGNATIONS = [
  "PRE_HOSPITAL",
  "CONSULTATION_BLOCKED",
  "DISPENSARY",
  "ECHO",
  "ECHO_DEPARTMENT_BLOCKED",
  "ECHO_PENTA",
] as const;

export type SlotDesignation = (typeof SLOT_DESIGNATIONS)[number];

export const DESIGNATION_LABEL: Record<SlotDesignation, string> = {
  PRE_HOSPITAL: "akútne",
  CONSULTATION_BLOCKED: "porada",
  DISPENSARY: "dispenzár",
  ECHO: "echo",
  ECHO_DEPARTMENT_BLOCKED: "echo oddelenie",
  ECHO_PENTA: "echo penta",
};

/** The slot fields a designation change writes. */
export interface DesignationTarget {
  appointmentType: AppointmentTypeLit;
  color: ColorKey;
  status: SlotStatusLit;
  releaseAt: Date | null;
  /** True only for the BLOCKED → bookable transition; see resolveDesignation. */
  manualLock: boolean;
  lockedReason: string | null;
}

/** Reason stamped on a slot that a designation change left manually locked. */
export const DESIGNATION_LOCK_REASON = "Zmena určenia slotu";

const TYPE_AND_COLOR: Record<
  SlotDesignation,
  { appointmentType: AppointmentTypeLit; color: ColorKey }
> = {
  PRE_HOSPITAL: { appointmentType: "PRE_HOSPITAL", color: "pink" },
  CONSULTATION_BLOCKED: {
    appointmentType: "CONSULTATION_BLOCKED",
    color: "grey",
  },
  DISPENSARY: { appointmentType: "DISPENSARY", color: "white" },
  ECHO: { appointmentType: "ECHO", color: "blue" },
  ECHO_DEPARTMENT_BLOCKED: {
    appointmentType: "ECHO_DEPARTMENT_BLOCKED",
    color: "navy",
  },
  ECHO_PENTA: { appointmentType: "ECHO", color: "yellow" },
};

/** Designations that are never bookable — they mirror initialSlotStatus. */
const BLOCKED_DESIGNATIONS: readonly SlotDesignation[] = [
  "CONSULTATION_BLOCKED",
  "ECHO_DEPARTMENT_BLOCKED",
];

/**
 * What a slot must look like after being re-designated.
 *
 * The release window is deliberately preserved for bookable targets: changing
 * what a slot is for must not change when it opens, so an AVAILABLE slot stays
 * available and a LOCKED one keeps its original releaseAt. Three exceptions,
 * all of which are properties of the target rather than of the old slot:
 *   - porada / ECHO oddelenie are never bookable      → BLOCKED, no release,
 *   - echo penta carries its own window — every PENTA slot opens
 *     PENTA_RELEASE_DAYS_BEFORE (10) days before its date, whatever the source
 *     (AVAILABLE once inside the window, LOCKED until the cron opens it),
 *   - a slot coming FROM a blocked state has no meaningful release window to
 *     keep, so it lands on LOCKED rather than AVAILABLE. That is the
 *     conservative direction (the stricter source must not yield a looser
 *     result), and it keeps slot.unlock the only audited action that opens
 *     capacity. Such a slot is also marked manualLock so it shows up in the
 *     admin "ručne zamknuté sloty" list instead of being locked forever with
 *     nobody remembering it.
 */
export function resolveDesignation(
  designation: SlotDesignation,
  current: { status: SlotStatusLit; releaseAt: Date | null },
  /** The slot's calendar day (@db.Date, midnight UTC) and the moment of the change. */
  when: { dayDate: Date; now: Date },
): DesignationTarget {
  const { appointmentType, color } = TYPE_AND_COLOR[designation];
  const base = { appointmentType, color };

  if (BLOCKED_DESIGNATIONS.includes(designation)) {
    return {
      ...base,
      status: "BLOCKED",
      releaseAt: null,
      manualLock: false,
      lockedReason: null,
    };
  }
  if (designation === "ECHO_PENTA") {
    const releaseAt = pentaReleaseAt(when.dayDate);
    return {
      ...base,
      status: releaseAt.getTime() <= when.now.getTime() ? "AVAILABLE" : "LOCKED",
      releaseAt,
      manualLock: false,
      lockedReason: null,
    };
  }
  // Bookable target.
  if (current.status === "AVAILABLE") {
    return {
      ...base,
      status: "AVAILABLE",
      releaseAt: current.releaseAt,
      manualLock: false,
      lockedReason: null,
    };
  }
  if (current.status === "LOCKED") {
    return {
      ...base,
      status: "LOCKED",
      releaseAt: current.releaseAt,
      manualLock: false,
      lockedReason: null,
    };
  }
  // Coming from BLOCKED (porada / ECHO oddelenie / a closed day).
  return {
    ...base,
    status: "LOCKED",
    releaseAt: null,
    manualLock: true,
    lockedReason: DESIGNATION_LOCK_REASON,
  };
}

/**
 * The designation a slot currently carries. ECHO splits on colour, which is the
 * only thing that distinguishes a PENTA slot from a plain echo one.
 * ACUTE_RESERVE (legacy, no template rule) and CUSTOM report as the nearest
 * bookable designation so the picker always has a current value to preselect.
 */
export function designationOf(slot: {
  appointmentType: AppointmentTypeLit;
  color: string;
}): SlotDesignation {
  switch (slot.appointmentType) {
    case "ECHO":
      return slot.color === "yellow" ? "ECHO_PENTA" : "ECHO";
    case "CONSULTATION_BLOCKED":
      return "CONSULTATION_BLOCKED";
    case "ECHO_DEPARTMENT_BLOCKED":
      return "ECHO_DEPARTMENT_BLOCKED";
    case "PRE_HOSPITAL":
    case "ACUTE_RESERVE":
      return "PRE_HOSPITAL";
    case "DISPENSARY":
    case "CUSTOM":
      return "DISPENSARY";
  }
}
