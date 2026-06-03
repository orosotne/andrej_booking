"use client";

import type { CalendarDayDTO, SlotDTO } from "@/lib/api-types";
import { clinicTime, clinicLongDate, CLINIC_TZ } from "@/lib/format";
import { TYPE_META, STATUS_LABEL, apptStatusLabel } from "@/lib/slot-style";

/**
 * Print / "Export do PDF" view of the calendar — one clean, continuous table
 * shared by the day, week and month views so every period prints identically.
 * Hidden on screen via `.calendar-print { display: none }`; the `@media print`
 * rules in globals.css reveal it (and hide the live UI) when the user triggers
 * the browser print dialog (Tlačiť → "Uložiť ako PDF").
 *
 * ── Export configuration (layout/format/fonts) ───────────────────────────────
 *   • Page format : A4 portrait, 14 mm margins   (see @page in globals.css)
 *   • Layout      : a single <table> grouped per day; the column <thead>
 *                   repeats on every printed page; rows never split across pages.
 *   • Fonts       : inherits the app sans (IBM Plex Sans → system-ui fallback);
 *                   ~11px body, 10px caption, tabular-nums for the time column.
 *   • Columns     : Čas · Typ · Stav · Pacient · Telefón · Účasť · Poznámka.
 *   • Data        : exactly the slots the on-screen view already loaded — no
 *                   extra fetch, no derived/altered content. Booked slots add
 *                   the patient name + phone; otherwise those cells show "—".
 *                   The Účasť column reflects appointment.status (Prišiel /
 *                   Neprišiel / Objednaný / …) so the printout records who
 *                   actually attended.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type PeriodKind = "day" | "week" | "month";

export interface PrintGroup {
  iso: string;
  day?: CalendarDayDTO;
}

const PERIOD_NOUN: Record<PeriodKind, string> = {
  day: "Deň",
  week: "Týždeň",
  month: "Mesiac",
};

const printedAtFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  dateStyle: "short",
  timeStyle: "short",
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const patientName = (slot: SlotDTO) =>
  slot.appointment
    ? `${slot.appointment.patient.lastName} ${slot.appointment.patient.firstName}`
    : "—";

const attendanceLabel = (slot: SlotDTO) =>
  slot.appointment
    ? apptStatusLabel(slot.appointment.status)
    : "—";

// Notes are recorded on the patient; the appointment note is a fallback. Long
// notes are clipped with an ellipsis so the narrow print column stays tidy
// while still signalling the text continues.
const NOTE_PRINT_LIMIT = 80;

const noteText = (slot: SlotDTO) => {
  const raw = slot.appointment
    ? slot.appointment.patient.note ?? slot.appointment.note
    : slot.lockedReason;
  const t = raw?.trim();
  if (!t) return "—";
  return t.length > NOTE_PRINT_LIMIT ? `${t.slice(0, NOTE_PRINT_LIMIT)}…` : t;
};

export function CalendarPrint({
  period,
  periodLabel,
  groups,
}: {
  period: PeriodKind;
  periodLabel: string;
  groups: PrintGroup[];
}) {
  // Keep only days that actually carry slots; sort their slots by start time.
  const renderable = groups
    .filter((g): g is { iso: string; day: CalendarDayDTO } => !!g.day && g.day.slots.length > 0)
    .map((g) => ({
      iso: g.iso,
      day: g.day,
      slots: [...g.day.slots].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    }));

  let total = 0;
  let booked = 0;
  let available = 0;
  for (const { slots } of renderable) {
    for (const s of slots) {
      total++;
      if (s.status === "BOOKED") booked++;
      else if (s.status === "AVAILABLE") available++;
    }
  }

  return (
    <section className="calendar-print" aria-hidden="true">
      <div className="print-head">
        <div>
          <h1 className="print-title">Kalendár ambulancie</h1>
          <p className="print-period">
            {PERIOD_NOUN[period]} · {capitalize(periodLabel)}
          </p>
        </div>
        <div className="print-meta">
          <p>
            {total} slotov · {booked} objednaných · {available} voľných
          </p>
          <p>Vytlačené {printedAtFmt.format(new Date())}</p>
        </div>
      </div>

      {renderable.length === 0 ? (
        <p className="print-empty">Žiadne vygenerované sloty pre toto obdobie.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col className="col-cas" />
            <col className="col-typ" />
            <col className="col-stav" />
            <col className="col-pacient" />
            <col className="col-telefon" />
            <col className="col-ucast" />
            <col className="col-poznamka" />
          </colgroup>
          <thead>
            <tr>
              <th>Čas</th>
              <th>Typ</th>
              <th>Stav</th>
              <th>Pacient</th>
              <th>Telefón</th>
              <th>Účasť</th>
              <th>Poznámka</th>
            </tr>
          </thead>
          {renderable.map(({ iso, day, slots }) => (
            <tbody key={iso}>
              {period !== "day" && (
                <tr className="print-day-head">
                  <th colSpan={7}>
                    {capitalize(clinicLongDate(iso))}
                    {day.status === "CLOSED" &&
                      ` · Zatvorené${day.note ? ` (${day.note})` : ""}`}
                  </th>
                </tr>
              )}
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td className="print-time">
                    {clinicTime(slot.startAt)}–{clinicTime(slot.endAt)}
                  </td>
                  <td>{TYPE_META[slot.appointmentType].label}</td>
                  <td>{STATUS_LABEL[slot.status]}</td>
                  <td>{patientName(slot)}</td>
                  <td className="print-phone">{slot.appointment?.patient.phone ?? "—"}</td>
                  <td>{attendanceLabel(slot)}</td>
                  <td className="print-note">{noteText(slot)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}
