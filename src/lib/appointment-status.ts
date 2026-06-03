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
