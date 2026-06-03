import type { Patient } from "@/generated/prisma/client";

// Patient snapshots written to the (append-only, indefinitely retained) audit
// trail must not carry the directly-identifying special-category PII: the Slovak
// national ID (rodné číslo) and the full date of birth. Retaining those forever
// — and keeping them even after a patient is erased — is the main GDPR liability
// flagged in review. They are reduced to a boolean "value was present" marker so
// the audit still records that the field existed/changed, without storing it.
// Less-sensitive contact fields (phone, email, note) are kept for audit value.
export function auditPatientSnapshot<T extends Partial<Patient>>(patient: T) {
  const { nationalId, dateOfBirth, ...rest } = patient;
  return {
    ...rest,
    nationalId: nationalId != null ? "[redacted]" : null,
    dateOfBirth: dateOfBirth != null ? "[redacted]" : null,
  };
}
