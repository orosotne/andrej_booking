"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { PatientSearch, type PatientLite } from "./PatientSearch";
import type { SlotDTO } from "@/lib/api-types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate } from "@/lib/format";

export function BookingDialog({
  slot,
  dayIso,
  isAdmin = false,
  onClose,
  onBooked,
}: {
  slot: SlotDTO;
  dayIso: string;
  isAdmin?: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { busy, run } = useAsyncAction();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [note, setNote] = useState("");
  const meta = TYPE_META[slot.appointmentType];

  function confirm() {
    if (!patient) return;
    run(
      () =>
        apiSend(`/api/slots/${slot.id}/book`, "POST", {
          patientId: patient.id,
          appointmentType: slot.appointmentType,
          note: note || undefined,
        }),
      { success: `Objednané: ${patient.lastName} ${patient.firstName}`, onDone: onBooked },
    );
  }

  function lock() {
    run(() => apiSend(`/api/slots/${slot.id}/lock`, "POST", {}), {
      success: "Slot zamknutý",
      onDone: onBooked,
    });
  }

  return (
    <Modal
      title="Objednať pacienta"
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)} · ${meta.label}`}
      onClose={onClose}
    >
      {!patient ? (
        <div className="space-y-3">
          <PatientSearch onSelect={setPatient} />
          {isAdmin && (
            <div className="border-t border-slate-100 pt-3">
              <Button variant="outline" fullWidth loading={busy} onClick={lock}>
                <Lock className="h-4 w-4" />
                Zamknúť slot (chrániť kapacitu)
              </Button>
            </div>
          )}
        </div>
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
