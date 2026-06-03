"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, CalendarClock, Loader2, Printer } from "lucide-react";
import type { SlotDTO } from "@/lib/api-types";
import { apiGet, apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";

export interface RescheduleOption {
  slot: SlotDTO;
  dayIso: string;
}

type Mode = "view" | "cancel" | "reschedule" | "note" | "statusPassword";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Objednaný",
  ARRIVED: "Prišiel",
  NO_SHOW: "Neprišiel",
  CANCELLED: "Zrušený",
  RESCHEDULED: "Presunutý",
  COMPLETED: "Vybavený",
};

// Setting NO_SHOW or leaving it again is gated by the same unlock password as
// opening Wednesday/Friday — enforced server-side, mirrored here for the UX.
function statusNeedsPassword(current: string, target: string) {
  return target === "NO_SHOW" || current === "NO_SHOW";
}

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
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [options, setOptions] = useState<RescheduleOption[] | null>(null);
  const meta = TYPE_META[slot.appointmentType];

  if (!appointment) return null;
  const apptId = appointment.id;

  // Status changes keep the modal open: update the local status, refresh the
  // calendar in the background, and stay on the view so the new colour shows.
  function submitStatus(target: string, pw?: string) {
    runAction(
      () => apiSend(`/api/appointments/${apptId}`, "PATCH", { status: target, password: pw }),
      {
        success: `Stav: ${STATUS_LABEL[target] ?? target}`,
        onDone: () => {
          setStatus(target);
          setPendingStatus(null);
          setPassword("");
          setMode("view");
          onChanged();
        },
      },
    );
  }

  function changeStatus(clicked: "ARRIVED" | "NO_SHOW") {
    const target = status === clicked ? "SCHEDULED" : clicked;
    if (statusNeedsPassword(status, target)) {
      setPendingStatus(target);
      setPassword("");
      setMode("statusPassword");
    } else {
      submitStatus(target);
    }
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
              {STATUS_LABEL[status] ?? status}
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

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={status === "ARRIVED" ? "success" : "secondary"}
              size="sm"
              disabled={busy}
              onClick={() => changeStatus("ARRIVED")}
            >
              Prišiel
            </Button>
            <Button
              variant={status === "NO_SHOW" ? "danger" : "secondary"}
              size="sm"
              disabled={busy}
              onClick={() => changeStatus("NO_SHOW")}
            >
              Neprišiel
            </Button>
          </div>

          {status !== "ARRIVED" && (
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <Button variant="outline" fullWidth onClick={openReschedule}>
                Presunúť
              </Button>
              {status !== "NO_SHOW" && (
                <Button
                  variant="secondary"
                  fullWidth
                  className="border-red-200 bg-red-50 text-red-700 ring-0 hover:bg-red-100"
                  onClick={() => setMode("cancel")}
                >
                  Zrušiť
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "statusPassword" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Zmena stavu „Neprišiel“ je chránená heslom (rovnakým ako pri otváraní
            stredy a piatka). Zadajte ho pre potvrdenie.
          </p>
          <Field
            label="Heslo"
            type="password"
            autoComplete="one-time-code"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setMode("view")}>
              Späť
            </Button>
            <Button
              fullWidth
              loading={busy}
              disabled={!password.trim()}
              onClick={() =>
                pendingStatus && submitStatus(pendingStatus, password.trim())
              }
            >
              Potvrdiť
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
