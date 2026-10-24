"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ApiError } from "@/lib/client";
import { clinicDate, clinicShortDate } from "@/lib/format";
import {
  establishedFrom,
  isEstablishedPatientSlot,
  isNewPatient,
  NEW_PATIENT_DAYS,
  NEW_PATIENT_SLOT_MESSAGE,
} from "@/lib/new-patient-rule";

/** When the patient was registered and from when they may take the slot without a password. */
export interface NewPatientGateInfo {
  registeredOn: string | null; // YYYY-MM-DD, clinic date
  allowedFrom: string | null;
}

/**
 * The gate info carried by a booking/reschedule the server refused with
 * NEW_PATIENT_SLOT, or null for any other failure (which stays a plain toast).
 */
export function newPatientGateFromError(e: unknown): NewPatientGateInfo | null {
  if (!(e instanceof ApiError) || e.code !== "NEW_PATIENT_SLOT") return null;
  const d = e.details ?? {};
  return {
    registeredOn: typeof d.registeredOn === "string" ? d.registeredOn : null,
    allowedFrom: typeof d.allowedFrom === "string" ? d.allowedFrom : null,
  };
}

/**
 * The same verdict computed up front, before anything is sent, when the
 * patient's registration time is known. The server re-checks either way.
 */
export function newPatientGateFor(
  slot: { appointmentType: string; startAt: string },
  patient: { createdAt?: string } | null,
): NewPatientGateInfo | null {
  if (!patient?.createdAt || !isEstablishedPatientSlot(slot)) return null;
  if (!isNewPatient(patient.createdAt)) return null;
  return {
    registeredOn: clinicDate(patient.createdAt),
    allowedFrom: establishedFrom(patient.createdAt),
  };
}

/**
 * "TENTO SLOT NIE JE URČENÝ PRE NOVÝCH PACIENTOV" + the override password.
 * Submitting re-sends the very same booking/reschedule with the password.
 */
export function NewPatientGatePanel({
  info,
  busy,
  submitLabel,
  submitDisabled = false,
  onSubmit,
  onCancel,
}: {
  info: NewPatientGateInfo;
  busy: boolean;
  submitLabel: string;
  /** Extra precondition of the surrounding form (e.g. a category still to pick). */
  submitDisabled?: boolean;
  onSubmit: (password: string) => void;
  onCancel?: () => void;
}) {
  const [password, setPassword] = useState("");
  const canSubmit = password.length > 0 && !submitDisabled;

  return (
    <form
      className="space-y-3 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(password);
      }}
    >
      <div className="flex items-start gap-2 text-red-800">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-extrabold uppercase tracking-wide">
            {NEW_PATIENT_SLOT_MESSAGE}
          </p>
          <p className="mt-1 text-xs leading-snug text-red-700">
            Bez hesla sem možno objednať len pacienta registrovaného aspoň{" "}
            {NEW_PATIENT_DAYS} dní
            {info.registeredOn
              ? ` — tento je v systéme od ${clinicShortDate(info.registeredOn)}`
              : ""}
            {info.allowedFrom
              ? ` (bez hesla od ${clinicShortDate(info.allowedFrom)})`
              : ""}
            . So správnym heslom ho sem objednáte aj tak.
          </p>
        </div>
      </div>
      <Field
        label="Heslo"
        type="password"
        required
        autoFocus
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" fullWidth disabled={busy} onClick={onCancel}>
            Späť
          </Button>
        )}
        <Button type="submit" variant="danger" size="sm" fullWidth loading={busy} disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
