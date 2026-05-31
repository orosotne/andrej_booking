"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { CalendarClock } from "lucide-react";
import type { SlotDTO } from "@/lib/api-types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";

export interface RescheduleOption {
  slot: SlotDTO;
  dayIso: string;
}

type Mode = "view" | "cancel" | "reschedule" | "note";

const STATUS_ACTIONS: { value: string; label: string }[] = [
  { value: "ARRIVED", label: "Prišiel" },
  { value: "NO_SHOW", label: "Neprišiel" },
  { value: "COMPLETED", label: "Vybavené" },
];

export function AppointmentActions({
  slot,
  dayIso,
  rescheduleOptions,
  onClose,
  onChanged,
}: {
  slot: SlotDTO;
  dayIso: string;
  rescheduleOptions: RescheduleOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const appointment = slot.appointment;
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState("");
  const [noteText, setNoteText] = useState(appointment?.note ?? "");
  const [busy, setBusy] = useState(false);
  const meta = TYPE_META[slot.appointmentType];

  if (!appointment) return null;
  const apptId = appointment.id;

  async function run(fn: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast(successMsg, "success");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Operácia zlyhala", "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${appointment.patient.lastName} ${appointment.patient.firstName}`}
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)} · ${meta.label}`}
      onClose={onClose}
    >
      {mode === "view" && (
        <div className="space-y-4">
          {appointment.patient.phone && (
            <p className="text-sm text-slate-600">📞 {appointment.patient.phone}</p>
          )}
          <button
            type="button"
            onClick={() => setMode("note")}
            className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm transition hover:bg-slate-100"
          >
            {appointment.note ? (
              <span className="text-slate-700">{appointment.note}</span>
            ) : (
              <span className="text-slate-400">+ Pridať poznámku</span>
            )}
          </button>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Stav: {appointment.status}
          </p>

          <div className="grid grid-cols-3 gap-2">
            {STATUS_ACTIONS.map((a) => (
              <Button
                key={a.value}
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => apiSend(`/api/appointments/${apptId}`, "PATCH", { status: a.value }),
                    `Stav: ${a.label}`,
                  )
                }
              >
                {a.label}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" fullWidth onClick={() => setMode("reschedule")}>
              Presunúť
            </Button>
            <Button
              variant="secondary"
              fullWidth
              className="border-red-200 bg-red-50 text-red-700 ring-0 hover:bg-red-100"
              onClick={() => setMode("cancel")}
            >
              Zrušiť
            </Button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="space-y-3">
          <TextareaField
            label="Dôvod zrušenia"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setMode("view")}>
              Späť
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={busy}
              disabled={!reason.trim()}
              onClick={() =>
                run(
                  () => apiSend(`/api/appointments/${apptId}/cancel`, "POST", { reason }),
                  "Objednávka zrušená",
                )
              }
            >
              Zrušiť objednávku
            </Button>
          </div>
        </div>
      )}

      {mode === "note" && (
        <div className="space-y-3">
          <TextareaField
            label="Poznámka"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setMode("view")}>
              Späť
            </Button>
            <Button
              fullWidth
              loading={busy}
              onClick={() =>
                run(
                  () => apiSend(`/api/appointments/${apptId}`, "PATCH", { note: noteText }),
                  "Poznámka uložená",
                )
              }
            >
              Uložiť poznámku
            </Button>
          </div>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Vyberte voľný slot rovnakého typu ({meta.label}):
          </p>
          {rescheduleOptions.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Žiadny voľný slot"
              description="V zobrazenom rozsahu nie je voľný slot tohto typu."
            />
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {rescheduleOptions.map((opt) => (
                <li key={opt.slot.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiSend(`/api/appointments/${apptId}/reschedule`, "POST", {
                            newSlotId: opt.slot.id,
                          }),
                        "Objednávka presunutá",
                      )
                    }
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-800">
                      {clinicDayChip(opt.dayIso)}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {clinicTime(opt.slot.startAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" fullWidth onClick={() => setMode("view")}>
            Späť
          </Button>
        </div>
      )}
    </Modal>
  );
}
