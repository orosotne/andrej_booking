import { AppointmentStatus } from "@/generated/prisma/enums";

// Statuses representing real, irreversible state (active commitments or completed
// medical records). Anything else (CANCELLED, NO_SHOW, RESCHEDULED) is scheduling
// noise — those rows are cleaned up alongside the parent so phantom history can't
// permanently block deletion.
export const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.COMPLETED,
];

// Statuses whose appointment still OCCUPIES its slot (the slot stays BOOKED).
// NO_SHOW belongs here even though it is scheduling noise for deletion purposes:
// marking a no-show never frees the slot, only /cancel and /reschedule do.
export const SLOT_OCCUPYING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];
