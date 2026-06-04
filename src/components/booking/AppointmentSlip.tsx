"use client";

import { createPortal } from "react-dom";
import { clinicLongDate, clinicTime } from "@/lib/format";

/**
 * Swaps the print target to just the appointment slip (body.printing-slip is
 * styled in globals) and triggers the browser print dialog. The class is removed
 * after printing. Pair with one rendered <AppointmentSlip/> on the page.
 */
export function printSlip() {
  document.body.classList.add("printing-slip");
  const cleanup = () => {
    document.body.classList.remove("printing-slip");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

/**
 * The printable booking confirmation slip. Hidden on screen; only shown when
 * the page is printing with the `printing-slip` body flag (set by printSlip).
 * Single source of truth for the slip layout — reused by the calendar
 * appointment modal and the patient detail.
 */
export function AppointmentSlip({
  patientName,
  dayIso,
  startAt,
  endAt,
  typeLabel,
}: {
  patientName: string;
  dayIso: string;
  startAt: string;
  endAt: string;
  typeLabel: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <section className="appointment-slip-print" aria-hidden="true">
      <div className="slip-header">
        <p className="slip-clinic">
          Pacient objednaný na kardiologickú ambulanciu č. 2 v nemocnici
          Partizánske
        </p>
        <p className="slip-address">
          Adresa: Nemocničná cesta, 958 03 Malé Kršteňany
        </p>
      </div>
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
            <td className="slip-name">{patientName}</td>
            <td>{clinicLongDate(dayIso)}</td>
            <td className="slip-time">
              {clinicTime(startAt)}–{clinicTime(endAt)}
            </td>
            <td>{typeLabel}</td>
          </tr>
        </tbody>
      </table>
    </section>,
    document.body,
  );
}
