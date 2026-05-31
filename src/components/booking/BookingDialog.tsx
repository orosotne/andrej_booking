"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PatientSearch, type PatientLite } from "./PatientSearch";
import type { SlotDTO } from "@/lib/api-types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate } from "@/lib/format";

export function BookingDialog({
  slot,
  dayIso,
  onClose,
  onBooked,
}: {
  slot: SlotDTO;
  dayIso: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = TYPE_META[slot.appointmentType];

  async function confirm() {
    if (!patient) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/slots/${slot.id}/book`, "POST", {
        patientId: patient.id,
        appointmentType: slot.appointmentType,
        note: note || undefined,
      });
      onBooked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Objednanie zlyhalo");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Objednať pacienta"
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)} · ${meta.label}`}
      onClose={onClose}
    >
      {!patient ? (
        <PatientSearch onSelect={setPatient} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-900">
              {patient.lastName} {patient.firstName}
            </p>
            {patient.phone && (
              <p className="text-sm text-slate-500">{patient.phone}</p>
            )}
            <button
              type="button"
              onClick={() => setPatient(null)}
              className="mt-1 text-xs text-slate-500 underline hover:text-slate-700"
            >
              Zmeniť pacienta
            </button>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Poznámka (voliteľné)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Objednávam…" : "Potvrdiť objednávku"}
          </button>
        </div>
      )}
    </Modal>
  );
}
