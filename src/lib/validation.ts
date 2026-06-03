import { z } from "zod";

export const isoDate = z
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

// Dovolenka (rozsah zatvorených dní). Spravuje ju ADMIN, preto bez hesla;
// dôvod je nepovinný. Rovnaká schéma slúži na vytvorenie aj zmenu dátumov.
export const vacationCreateSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: "Dátum „od“ musí byť skôr alebo rovnaký ako „do“.",
    path: ["to"],
  });

export const vacationUpdateSchema = vacationCreateSchema;

// Zatvorenie jedného dňa. Heslo zostáva nepovinné v schéme, aby chýbajúce/zlé
// heslo hlásil assertUnlockPassword rovnakou hláškou ako doteraz; schéma navyše
// validuje a ohraničuje `force` a `reason` (predtým neoverené).
export const closeDaySchema = z.object({
  force: z.boolean().optional(),
  reason: z.string().max(500).optional(),
  password: z.string().max(200).optional(),
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

// PATCH may only set "presence" outcomes. CANCELLED and RESCHEDULED are omitted
// on purpose: they must also free or move the underlying slot atomically, which
// is exactly what the dedicated /cancel and /reschedule endpoints do. Accepting
// them here would flip appointment.status while leaving the slot BOOKED
// (orphaned slot). The full status set lives in the Prisma AppointmentStatus enum.
export const patchableAppointmentStatus = z.enum([
  "SCHEDULED",
  "ARRIVED",
  "NO_SHOW",
  "COMPLETED",
]);

export const updateAppointmentSchema = z.object({
  status: patchableAppointmentStatus.optional(),
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

// Known settings are type-checked so a bad value (e.g. a non-number
// retentionMonths, which feeds the purge cutoff) is rejected with a clean 400
// instead of silently corrupting logic. Unknown keys still pass through via
// catchall: the settings form re-sends every stored key on save, so rejecting
// unrecognised keys would break that round-trip.
export const settingsUpdateSchema = z
  .object({
    generateMonthsAhead: z.number().int().min(1).max(36).optional(),
    sessionTimeoutMinutes: z.number().int().min(1).max(1440).optional(),
    retentionMonths: z.number().int().min(1).max(120).optional(),
    enableLateSlot: z.boolean().optional(),
    twoFactorRequired: z.boolean().optional(),
    storeSensitivePatientData: z.boolean().optional(),
  })
  .catchall(z.unknown());

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

// --- User management (admin-only) ---

export const roleEnum = z.enum(["ADMIN", "DOCTOR", "NURSE"]);

export const userCreateSchema = z.object({
  name: z.string().min(1, "Meno je povinné").max(120),
  email: z.string().email("Neplatný e-mail"),
  role: roleEnum,
  // Optional expiry for temporary stand-in accounts (stored as end of that day).
  expiresAt: isoDate.optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1, "Meno je povinné").max(120).optional(),
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
  // null explicitly clears the expiry (turns a temporary account permanent).
  expiresAt: isoDate.nullable().optional(),
});

// Reset a user's password. Omit `password` to have the server generate a
// readable passphrase; pass one to set it explicitly.
export const userPasswordSchema = z.object({
  password: z.string().min(8, "Heslo musí mať aspoň 8 znakov").max(200).optional(),
});
