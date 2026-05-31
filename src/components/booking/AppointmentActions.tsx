"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { SlotDTO } from "@/lib/api-types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";

export interface RescheduleOption {
  slot: SlotDTO;
  dayIso: string;
}

type Mode = "view" | "cancel" | "reschedule";

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
  const appointment = slot.appointment;
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = TYPE_META[slot.appointmentType];

  if (!appointment) return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operácia zlyhala");
      setBusy(false);
    }
  }

  const apptId = appointment.id;

  return (
    <Modal
      title={`${appointment.patient.lastName} ${appointment.patient.firstName}`}
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)} · ${meta.label}`}
      onClose={onClose}
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {mode === "view" && (
        <div className="space-y-4">
          {appointment.patient.phone && (
            <p className="text-sm text-slate-600">📞 {appointment.patient.phone}</p>
          )}
          {appointment.note && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {appointment.note}
            </p>
          )}
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Stav: {appointment.status}
          </p>

          <div className="grid grid-cols-3 gap-2">
            {STATUS_ACTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => apiSend(`/api/appointments/${apptId}`, "PATCH", { status: a.value }))
                }
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setMode("reschedule")}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Presunúť
            </button>
            <button
              type="button"
              onClick={() => setMode("cancel")}
              className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Zrušiť
            </button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Dôvod zrušenia *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Späť
            </button>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() =>
                run(() => apiSend(`/api/appointments/${apptId}/cancel`, "POST", { reason }))
              }
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Zrušiť objednávku
            </button>
          </div>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Vyberte voľný slot rovnakého typu ({meta.label}):
          </p>
          {rescheduleOptions.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
              V zobrazenom rozsahu nie je voľný slot tohto typu.
            </p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {rescheduleOptions.map((opt) => (
                <li key={opt.slot.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        apiSend(`/api/appointments/${apptId}/reschedule`, "POST", {
                          newSlotId: opt.slot.id,
                        }),
                      )
                    }
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
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
          <button
            type="button"
            onClick={() => setMode("view")}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Späť
          </button>
        </div>
      )}
    </Modal>
  );
}
