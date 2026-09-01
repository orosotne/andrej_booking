import type { AppointmentTypeLit, SlotStatusLit } from "./slot-engine/types";
import type { Granularity, StatAverages, StatCounts } from "./statistics";

// Serialized DTOs returned by the API (Dates become ISO strings over JSON).
// This is the contract between the API routes and the calendar UI.

export interface PatientLiteDTO {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  note: string | null;
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

// One row in the admin booked-appointments list: the slot (with its appointment
// + patient) plus the clinic-local day it falls on, ready for AppointmentActions.
export interface BookedAppointmentDTO {
  dayIso: string;
  slot: SlotDTO;
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

// A planned clinic closure (vacation). Dates are YYYY-MM-DD; createdAt is ISO.
export interface VacationDTO {
  id: string;
  from: string;
  to: string;
  reason: string | null;
  createdAt: string;
}

// An administratively closed day not owned by a vacation (manual closure or a
// closed public holiday). date is YYYY-MM-DD; holiday is the SK holiday name or null.
export interface ClosedDayDTO {
  date: string;
  note: string | null;
  holiday: string | null;
}

// A slot an admin locked by hand (status LOCKED, manualLock=true) — not the
// capacity-protection locks the release-rule engine generates. startAt/endAt are
// ISO instants; appointmentType is the slot's category.
export interface LockedSlotDTO {
  id: string;
  startAt: string;
  endAt: string;
  appointmentType: AppointmentTypeLit;
  lockedReason: string | null;
}

// Admin user-management DTO. Never carries passwordHash or totpSecret.
export interface AdminUserDTO {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "DOCTOR" | "NURSE";
  isActive: boolean;
  expiresAt: string | null; // YYYY-MM-DD, or null for a permanent account
  twoFactorEnabled: boolean;
  createdAt: string; // ISO instant
  passwordChangedAt: string | null; // ISO instant of last password set/change
}

// Booking statistics for one period (day / week / month / year). `key` is the
// bucket id ("2026-07", "2026-W31", …), `label` its clinic-locale name, and
// `counts` the five reported categories; see lib/statistics.ts.
export interface StatBucketDTO {
  key: string;
  label: string;
  counts: StatCounts;
  total: number;
}

export interface StatisticsResponse {
  granularity: Granularity;
  from: string; // YYYY-MM-DD, clinic-local booking date
  to: string;
  buckets: StatBucketDTO[];
  totals: StatCounts;
  total: number;
  /** Per-period averages from booking days (Thu + Fri) only; null when the
   * range contains none. */
  averages: StatAverages | null;
}

// ---------------------------------------------------------------------------
// Dashboard (/prehlad). One aggregate payload for the whole page; see
// lib/dashboard.ts for the pure logic and app/api/dashboard for the queries.
// ---------------------------------------------------------------------------

/** One booked patient on the focus day, in start-time order. */
export interface DashboardAppointmentDTO {
  id: string;
  startAt: string; // ISO instant
  appointmentType: AppointmentTypeLit;
  /** Same widened type as AppointmentLiteDTO.status; render via apptStatusLabel. */
  status: string;
  patientName: string;
  phone: string | null;
}

/** The day the dashboard leads with, or the compact card for the day after. */
export interface DashboardDayDTO {
  date: string; // YYYY-MM-DD
  status: string;
  note: string | null;
  holiday: string | null;
  counts: SlotCountsDTO;
  /** Free slots that have not started yet — the "ešte voľných dnes" number. */
  freeRemaining: number;
  byType: { akut: TypeAvailDTO; disp: TypeAvailDTO; echo: TypeAvailDTO; custom: TypeAvailDTO };
  arrived: number;
  noShow: number;
  completed: number;
  /** Past appointments on this day with no attendance recorded yet. */
  unresolved: number;
  appointments: DashboardAppointmentDTO[];
}

/** Mirrors calendar-ui's TypeAvail so SlotAvailByType can render it directly. */
export interface TypeAvailDTO {
  free: number;
  total: number;
}

export interface DashboardCapacityDTO {
  free14: number;
  free30: number;
  total30: number;
  /** ISO instant of the nearest free slot of this kind, or null if none. */
  nextFreeAt: string | null;
}

export interface DashboardAttentionDTO {
  /** Thu/Fri in the next 8 weeks with no slots — a silent cron-failure signal. */
  missingDays: string[];
  holidays: { iso: string; name: string; handled: boolean }[];
  vacations: VacationDTO[];
  openedWednesdays: string[];
  /** Manually closed days (not owned by a vacation). */
  closedDays: ClosedDayDTO[];
}

export interface DashboardReleaseDTO {
  /** Slots opened by the cron in the last 24 h, by kind. */
  last24h: { akut: number; disp: number; echo: number; total: number };
  /** The next release instant and how many slots it will open. */
  nextAt: string | null;
  nextCount: number;
}

export interface DashboardNoShowDTO {
  /** 0–1, or null when nothing in the window has been resolved yet. */
  rate: number | null;
  previousRate: number | null;
  noShow: number;
  resolved: number;
  /** Past appointments still sitting on SCHEDULED — nobody marked them. */
  unresolved: number;
  days: number;
}

export interface DashboardResponse {
  generatedAt: string; // ISO instant
  today: string; // YYYY-MM-DD, clinic time
  focus: DashboardDayDTO | null;
  focusIsToday: boolean;
  next: DashboardDayDTO | null;
  capacity: {
    akut: DashboardCapacityDTO;
    disp: DashboardCapacityDTO;
    echo: DashboardCapacityDTO;
  };
  attention: DashboardAttentionDTO;
  release: DashboardReleaseDTO;
  noShow: DashboardNoShowDTO;
  /** ADMIN only — omitted entirely for other roles. */
  manualLocks?: { total: number; upcoming: LockedSlotDTO[] };
}
