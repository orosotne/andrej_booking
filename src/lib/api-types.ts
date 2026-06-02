import type { AppointmentTypeLit, SlotStatusLit } from "./slot-engine/types";

// Serialized DTOs returned by the API (Dates become ISO strings over JSON).
// This is the contract between the API routes and the calendar UI.

export interface PatientLiteDTO {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface AppointmentLiteDTO {
  id: string;
  status: string;
  note: string | null;
  patient: PatientLiteDTO;
}

export interface SlotDTO {
  id: string;
  startAt: string;
  endAt: string;
  appointmentType: AppointmentTypeLit;
  status: SlotStatusLit;
  releaseAt: string | null;
  color: string;
  lockedReason: string | null;
  appointment: AppointmentLiteDTO | null;
}

export interface CalendarDayDTO {
  id: string;
  date: string;
  dayType: string;
  status: string;
  note: string | null;
  slots: SlotDTO[];
}

export interface CalendarResponse {
  days: CalendarDayDTO[];
}

// Free / booked / locked slot tally. Used both as the /api/calendar/stats
// response and as the return shape of the client-side countSlots() helper, so
// the in-view counters and the year total speak the same language.
export interface SlotCountsDTO {
  available: number;
  booked: number;
  locked: number;
}
