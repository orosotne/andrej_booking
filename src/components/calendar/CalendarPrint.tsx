"use client";

import { useCalendar } from "@/hooks/useCalendar";
import { clinicTime, clinicLongDate, CLINIC_TZ } from "@/lib/format";

/**
 * Print / "Export do PDF" view of a single day — a plain patient call-list for
 * the day currently in focus. Hidden on screen via `.calendar-print { display:
 * none }`; the `@media print` rules in globals.css reveal it (and hide the live
 * UI) when the print button fires window.print().
 *
 * Only booked slots are listed, sorted by time, with just the data the front
 * desk needs to receive patients: time, full name and phone number.
 */

const printedAtFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  dateStyle: "short",
  timeStyle: "short",
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function patientWord(n: number) {
  if (n === 1) return "pacient";
  if (n >= 2 && n <= 4) return "pacienti";
  return "pacientov";
}

export function CalendarDayPrint({ iso }: { iso: string }) {
  const { data } = useCalendar(iso, iso);
  const day = data?.days.find((d) => d.date === iso);
  const patients = (day?.slots ?? [])
    .filter((s) => s.status === "BOOKED" && s.appointment)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <section className="calendar-print" aria-hidden="true">
      <div className="print-head">
        <div>
          <h1 className="print-title">Zoznam objednaných pacientov</h1>
          <p className="print-period">{capitalize(clinicLongDate(iso))}</p>
        </div>
        <div className="print-meta">
          <p>
            {patients.length} {patientWord(patients.length)}
          </p>
          <p>Vytlačené {printedAtFmt.format(new Date())}</p>
        </div>
      </div>

      {patients.length === 0 ? (
        <p className="print-empty">Žiadni objednaní pacienti.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col className="col-cas" />
            <col className="col-pacient" />
            <col className="col-telefon" />
          </colgroup>
          <thead>
            <tr>
              <th>Čas</th>
              <th>Meno a priezvisko</th>
              <th>Telefón</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((slot) => (
              <tr key={slot.id}>
                <td className="print-time">{clinicTime(slot.startAt)}</td>
                <td>
                  {slot.appointment!.patient.lastName}{" "}
                  {slot.appointment!.patient.firstName}
                </td>
                <td>{slot.appointment!.patient.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
