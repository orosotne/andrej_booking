import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť vo formáte YYYY-MM-DD");

// Bookable types only — CONSULTATION_BLOCKED (poradňa) can never be booked.
export const bookableType = z.enum([
  "PRE_HOSPITAL",
  "DISPENSARY",
  "ECHO",
  "ACUTE_RESERVE",
  "CUSTOM",
]);

export const calendarRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const bookSlotSchema = z.object({
  patientId: z.string().min(1),
  appointmentType: bookableType,
  note: z.string().max(2000).optional(),
});

export const cancelSchema = z.object({
  reason: z.string().min(1, "Dôvod je povinný").max(500),
});

export const rescheduleSchema = z.object({
  newSlotId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const unlockSchema = z.object({
  reason: z.string().min(1, "Dôvod odomknutia je povinný").max(500),
});

export const appointmentStatus = z.enum([
  "SCHEDULED",
  "ARRIVED",
  "NO_SHOW",
  "CANCELLED",
  "RESCHEDULED",
  "COMPLETED",
]);

export const updateAppointmentSchema = z.object({
  status: appointmentStatus.optional(),
  note: z.string().max(2000).optional(),
});

export const patientCreateSchema = z.object({
  firstName: z.string().min(1, "Meno je povinné"),
  lastName: z.string().min(1, "Priezvisko je povinné"),
  dateOfBirth: isoDate.optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email("Neplatný e-mail").optional().or(z.literal("")),
  externalPatientId: z.string().max(60).optional(),
  note: z.string().max(2000).optional(),
});

export const patientUpdateSchema = patientCreateSchema.partial();

export const openDaySchema = z.object({
  note: z.string().max(500).optional(),
  overrideReason: z.string().max(500).optional(),
});

export const settingsUpdateSchema = z.record(z.string(), z.unknown());

export const releasePolicyUpdateSchema = z.object({
  daysBefore: z.number().int().min(0).max(365).nullable().optional(),
  requiresAdminOverride: z.boolean().optional(),
});

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Zadajte 6-miestny kód"),
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Čas musí byť HH:MM");
const appointmentType = z.enum([
  "PRE_HOSPITAL",
  "CONSULTATION_BLOCKED",
  "DISPENSARY",
  "ECHO",
  "ACUTE_RESERVE",
  "CUSTOM",
]);

export const slotRuleCreateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().max(120).optional(),
  startTime: hhmm,
  endTime: hhmm,
  appointmentType,
  color: z.string().min(1).max(40),
  isBookable: z.boolean(),
  releasePolicyId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(999).optional(),
});

export const slotRuleUpdateSchema = z.object({
  name: z.string().max(120).optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  appointmentType: appointmentType.optional(),
  color: z.string().min(1).max(40).optional(),
  isBookable: z.boolean().optional(),
  releasePolicyId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(999).optional(),
});
