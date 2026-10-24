import { timingSafeEqual } from "node:crypto";
import { ValidationError } from "@/lib/errors";

/** Length-safe constant-time string comparison (avoids leaking secrets via timing). */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the manager unlock password (WEDNESDAY_UNLOCK_PASSWORD). The same
 * password gates opening protected days (Wednesday / last Friday) and unlocking
 * a still-locked slot. Throws ValidationError if the server is misconfigured or
 * the provided password is missing/wrong.
 */
export function assertUnlockPassword(
  provided: string | undefined,
  wrongMessage: string,
): void {
  const expected = process.env.WEDNESDAY_UNLOCK_PASSWORD;
  if (!expected) {
    throw new ValidationError(
      "Server nie je nakonfigurovaný (chýba WEDNESDAY_UNLOCK_PASSWORD).",
    );
  }
  if (!provided || !constantTimeEqual(provided, expected)) {
    throw new ValidationError(wrongMessage);
  }
}

/**
 * Verifies the password that lets a new patient (registered < 10 days ago) into
 * a dispenzár slot reserved for established patients (lib/new-patient-rule.ts).
 * NEW_PATIENT_SLOT_PASSWORD when set — so the clinic can hand it to the staff
 * who book without also handing out the manager unlock password — otherwise
 * the manager unlock password (WEDNESDAY_UNLOCK_PASSWORD).
 */
export function assertNewPatientSlotPassword(provided: string | undefined): void {
  const expected =
    process.env.NEW_PATIENT_SLOT_PASSWORD || process.env.WEDNESDAY_UNLOCK_PASSWORD;
  if (!expected) {
    throw new ValidationError(
      "Server nie je nakonfigurovaný (chýba NEW_PATIENT_SLOT_PASSWORD aj WEDNESDAY_UNLOCK_PASSWORD).",
    );
  }
  if (!provided || !constantTimeEqual(provided, expected)) {
    throw new ValidationError("Nesprávne heslo pre objednanie nového pacienta.");
  }
}
