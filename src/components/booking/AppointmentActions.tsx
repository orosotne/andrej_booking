"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, CalendarClock, Loader2, Printer } from "lucide-react";
import type { SlotDTO } from "@/lib/api-types";
import { apiGet, apiSend } from "@/lib/client";
import { TYPE_META, apptStatusLabel } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";

// Grace window (min) after slot start before "Neprišiel" (no-show) can be set.
const NO_SHOW_GRACE_MIN = 10;

export interface RescheduleOption {
  slot: SlotDTO;
  dayIso: string;
}

type Mode = "view" | "cancel" | "reschedule" | "note";

function statusRowClass(status: string) {
  if (status === "ARRIVED") return "border-green-200 bg-green-50 text-green-800";
  if (status === "NO_SHOW") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function AppointmentActions({
  slot,
  dayIso,
  onClose,
  onChanged,
}: {
  slot: SlotDTO;
  dayIso: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { busy, run: runAction } = useAsyncAction();
  const { toast } = useToast();
  const appointment = slot.appointment;
  const [mode, setMode] = useState<Mode>("view");
  const [reason, setReason] = useState("");
  const [savedNote, setSavedNote] = useState(appointment?.note ?? "");
  const [noteText, setNoteText] = useState(appointment?.note ?? "");
  const [status, setStatus] = useState(appointment?.status ?? "SCHEDULED");
  const [statusOpen, setStatusOpen] = useState(false);
  const [options, setOptions] = useState<RescheduleOption[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const meta = TYPE_META[slot.appointmentType];

  // Attendance unlocks by time: "Prišiel" from start + 1 min, "Neprišiel" only
  // after a grace window (a late patient may still walk in). Timer re-renders at each gate.
  const startMs = new Date(slot.startAt).getTime();
  const arriveGateMs = startMs + 60_000;
  const noShowGateMs = startMs + NO_SHOW_GRACE_MIN * 60_000;
  // TEMP: time gate disabled for testing the Prišiel/Neprišiel/Objednaný buttons.
  // Revert these two lines to `now >= arriveGateMs` / `now >= noShowGateMs` before go-live.
  const canArrive = true;
  const canNoShow = true;
  useEffect(() => {
    const nextGate = [arriveGateMs, noShowGateMs].find((g) => g > now);
    if (nextGate === undefined) return;
    const delay = nextGate - Date.now();
    if (delay > 6 * 60 * 60_000) return;
    const id = setTimeout(() => setNow(Date.now()), delay + 250);
    return () => clearTimeout(id);
  }, [now, arriveGateMs, noShowGateMs]);

  if (!appointment) return null;
  const apptId = appointment.id;
  const arriveGateLabel = clinicTime(new Date(arriveGateMs).toISOString());
  const noShowGateLabel = clinicTime(new Date(noShowGateMs).toISOString());

  // Status changes keep the modal open: update the local status, refresh the
  // calendar in the background, and collapse back to the status summary.
  function submitStatus(target: string) {
    runAction(
      () => apiSend(`/api/appointments/${apptId}`, "PATCH", { status: target }),
      {
        success: `Stav: ${apptStatusLabel(target)}`,
        onDone: () => {
          setStatus(target);
          setStatusOpen(false);
          onChanged();
        },
      },
    );
  }

  // Clicking the already-active status clears it back to "Objednaný".
  function changeStatus(clicked: "ARRIVED" | "NO_SHOW") {
    submitStatus(status === clicked ? "SCHEDULED" : clicked);
  }

  async function openReschedule() {
    setMode("reschedule");
    setOptions(null);
    try {
      const res = await apiGet<{ options: RescheduleOption[] }>(
        `/api/appointments/${apptId}/reschedule-options`,
      );
      setOptions(res.options);
    } catch (e) {
      setOptions([]);
      toast(e instanceof Error ? e.message : "Načítanie termínov zlyhalo", "error");
    }
  }

  // Print a single-appointment slip for the patient. The slip lives in a portal
  // on <body>; the body.printing-slip flag swaps the print target to just it.
  function printSlip() {
    document.body.classList.add("printing-slip");
    const cleanup = () => {
      document.body.classList.remove("printing-slip");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <>
    <Modal
      title={`${appointment.patient.lastName} ${appointment.patient.firstName}`}
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)} · ${meta.label}`}
      onClose={onClose}
    >
      {mode === "view" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            {appointment.patient.phone ? (
              <p className="text-sm text-slate-600">📞 {appointment.patient.phone}</p>
            ) : (
              <span />
            )}
            <Button variant="outline" size="sm" onClick={printSlip}>
              <Printer className="h-4 w-4" />
              Tlačiť lístok
            </Button>
          </div>

          <div
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${statusRowClass(status)}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {status === "NO_SHOW" && (
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className={status === "ARRIVED" ? "line-through" : ""}>
                {appointment.patient.lastName} {appointment.patient.firstName}
              </span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {apptStatusLabel(status)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setNoteText(savedNote);
              setMode("note");
            }}
            className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm transition hover:bg-slate-100"
          >
            {savedNote ? (
              <span className="text-slate-700">{savedNote}</span>
            ) : (
              <span className="text-slate-400">+ Pridať poznámku</span>
            )}
          </button>

          {statusOpen ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={status === "ARRIVED" ? "success" : "secondary"}
                  size="sm"
                  disabled={busy}
                  title={status === "ARRIVED" ? "Zrušiť stav „Prišiel“" : undefined}
                  onClick={() => changeStatus("ARRIVED")}
                >
                  Prišiel
                </Button>
                <Button
                  variant={status === "NO_SHOW" ? "danger" : "secondary"}
                  size="sm"
                  disabled={busy || !canNoShow}
                  title={
                    !canNoShow
                      ? `„Neprišiel“ bude možné označiť o ${noShowGateLabel}`
                      : status === "NO_SHOW"
                        ? "Zrušiť stav „Neprišiel“"
                        : undefined
                  }
                  onClick={() => changeStatus("NO_SHOW")}
                >
                  Neprišiel
                </Button>
              </div>
              {!canNoShow && (
                <p className="text-center text-[11px] text-slate-400">
                  „Neprišiel“ bude možné označiť o {noShowGateLabel}
                </p>
              )}
              <button
                type="button"
                onClick={() => setStatusOpen(false)}
                className="block w-full text-center text-xs font-medium text-slate-400 transition hover:text-slate-600"
              >
                Zavrieť
              </button>
            </div>
          ) : canArrive ? (
            <button
              type="button"
              onClick={() => setStatusOpen(true)}
              className="block w-full text-center text-sm font-medium text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
            >
              Zmeniť stav
            </button>
          ) : (
            <p className="text-center text-xs text-slate-400">
              Stav bude možné zmeniť o {arriveGateLabel}
            </p>
          )}

          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" fullWidth onClick={openReschedule}>
              Presunúť termín
            </Button>
            <Button
              variant="secondary"
              fullWidth
              className="border-red-200 bg-red-50 text-red-700 ring-0 hover:bg-red-100"
              onClick={() => setMode("cancel")}
            >
              Zrušiť termín
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
                runAction(
                  () => apiSend(`/api/appointments/${apptId}/cancel`, "POST", { reason }),
                  { success: "Objednávka zrušená", onDone: () => { onChanged(); onClose(); } },
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
                runAction(
                  () => apiSend(`/api/appointments/${apptId}`, "PATCH", { note: noteText }),
                  {
                    success: "Poznámka uložená",
                    onDone: () => {
                      setSavedNote(noteText);
                      setMode("view");
                      onChanged();
                    },
                  },
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
            Najbližšie voľné termíny rovnakého typu ({meta.label}):
          </p>
          {options === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : options.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Žiadny voľný termín"
              description="Pre tento typ nie je odteraz dopredu žiadny voľný slot."
            />
          ) : (
            <ul className="space-y-1">
              {options.map((opt) => (
                <li key={opt.slot.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        () =>
                          apiSend(`/api/appointments/${apptId}/reschedule`, "POST", {
                            newSlotId: opt.slot.id,
                          }),
                        { success: "Objednávka presunutá", onDone: () => { onChanged(); onClose(); } },
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
      {typeof document !== "undefined" &&
        createPortal(
          <section className="appointment-slip-print" aria-hidden="true">
            <p className="slip-title">Termín vyšetrenia</p>
            <table className="slip-table">
              <thead>
                <tr>
                  <th scope="col">Pacient</th>
                  <th scope="col">Dátum</th>
                  <th scope="col">Čas</th>
                  <th scope="col">Typ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="slip-name">
                    {appointment.patient.lastName} {appointment.patient.firstName}
                  </td>
                  <td>{clinicLongDate(dayIso)}</td>
                  <td className="slip-time">
                    {clinicTime(slot.startAt)}–{clinicTime(slot.endAt)}
                  </td>
                  <td>{meta.label}</td>
                </tr>
              </tbody>
            </table>
          </section>,
          document.body,
        )}
    </>
  );
}
