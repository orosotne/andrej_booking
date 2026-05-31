"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
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
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = TYPE_META[slot.appointmentType];

  async function confirm() {
    if (!patient) return;
    setBusy(true);
    try {
      await apiSend(`/api/slots/${slot.id}/book`, "POST", {
        patientId: patient.id,
        appointmentType: slot.appointmentType,
        note: note || undefined,
      });
      toast(`Objednané: ${patient.lastName} ${patient.firstName}`, "success");
      onBooked();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Objednanie zlyhalo", "error");
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

          <TextareaField
            label="Poznámka (voliteľné)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />

          <Button variant="success" fullWidth loading={busy} onClick={confirm}>
            Potvrdiť objednávku
          </Button>
        </div>
      )}
    </Modal>
  );
}
