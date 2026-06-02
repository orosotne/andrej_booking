import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť vo formáte YYYY-MM-DD");

// Bookable types only — CONSULTATION_BLOCKED + ECHO_DEPARTMENT_BLOCKED can never be booked.
export const bookableType = z.enum([
  "PRE_HOSPITAL",
  "DISPENSARY",
  "ECHO",
  "ACUTE_RESERVE",
  "CUSTOM",
]);

export const patientCategoryEnum = z.enum([
  "DISPENZAR",
  "ECHO",
  "PRVOVYSETRENIE",
  "AKUTNE",
  "INE",
]);

export const calendarRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const bookSlotSchema = z
  .object({
    patientId: z.string().min(1),
    appointmentType: bookableType,
    patientCategory: patientCategoryEnum,
    categoryReason: z.string().max(500).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.patientCategory !== "INE" ||
      (v.categoryReason !== undefined && v.categoryReason.trim().length > 0),
    {
      message: "Pri kategórii 'Iné' je dôvod povinný.",
      path: ["categoryReason"],
    },
  );

export const cancelSchema = z.object({
  reason: z.string().min(1, "Dôvod je povinný").max(500),
});

export const rescheduleSchema = z.object({
  newSlotId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

// Odomknutie zamknutého slotu je chránené heslom (rovnaké ako pri otváraní
// stredy/posledného piatka). Dôvod je nepovinný, slúži len pre audit.
export const unlockSchema = z.object({
  password: z.string().min(1, "Heslo je povinné").max(200),
  reason: z.string().max(500).optional(),
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
  phone: z.string().min(1, "Telefónne číslo je povinné").max(40),
  birthYear: z.coerce
    .number({ message: "Rok narodenia je povinný" })
    .int("Rok narodenia musí byť celé číslo")
    .min(1900, "Neplatný rok narodenia")
    .max(new Date().getFullYear(), "Rok narodenia nemôže byť v budúcnosti"),
  // Rodné číslo je citlivý údaj — dobrovoľné, formát nevynucujeme.
  nationalId: z.string().max(20).optional().or(z.literal("")),
  dateOfBirth: isoDate.optional(),
  email: z.string().email("Neplatný e-mail").optional().or(z.literal("")),
  externalPatientId: z.string().max(60).optional(),
  note: z.string().max(2000).optional(),
});

// Update keeps phone optional (admins may edit other fields without resending phone).
export const patientUpdateSchema = patientCreateSchema.partial();

export const openDaySchema = z.object({
  note: z.string().max(500).optional(),
  overrideReason: z.string().max(500).optional(),
  password: z.string().max(200).optional(),
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

// Re-apply a template to its already-generated future days. dryRun previews the
// change (no writes); without it the sync is performed.
export const templateApplySchema = z.object({
  dryRun: z.boolean().optional().default(false),
});
