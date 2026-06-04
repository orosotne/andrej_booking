import type { SlotDTO } from "@/lib/api-types";
import type { AppointmentTypeLit, SlotStatusLit } from "@/lib/slot-engine/types";

// Minimal structural shapes — the only fields the SlotDTO serialization needs.
// Kept Prisma-agnostic so any query that selects these columns can reuse it.
interface SlotFields {
  id: string;
  startAt: Date;
  endAt: Date;
  appointmentType: string;
  status: string;
  releaseAt: Date | null;
  color: string;
  lockedReason: string | null;
}

interface ActiveAppointment {
  id: string;
  status: string;
  note: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    note: string | null;
  };
}

/**
 * Serializes an appointment slot (and its active appointment, if any) to the
 * SlotDTO wire shape. Single source of truth shared by the calendar payload and
 * the booked-appointments list, so the contract never drifts between them.
 */
export function toSlotDTO(
  slot: SlotFields,
  active: ActiveAppointment | null,
): SlotDTO {
  return {
    id: slot.id,
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    appointmentType: slot.appointmentType as AppointmentTypeLit,
    status: slot.status as SlotStatusLit,
    releaseAt: slot.releaseAt ? slot.releaseAt.toISOString() : null,
    color: slot.color,
    lockedReason: slot.lockedReason,
    appointment: active
      ? {
          id: active.id,
          status: active.status,
          note: active.note,
          patient: active.patient,
        }
      : null,
  };
}
