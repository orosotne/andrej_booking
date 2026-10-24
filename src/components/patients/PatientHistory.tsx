"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { TYPE_META } from "@/lib/slot-style";
import { clinicShortDate, clinicTime } from "@/lib/format";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";

/** One past termín from GET /api/patients/[id] (newest first). */
export interface HistoryDTO {
  id: string;
  startAt: string;
  appointmentType: string;
  date: string;
  /** ARRIVED / COMPLETED / NO_SHOW, or SCHEDULED for a past termín nobody marked. */
  status: string;
}

/** Attendance over the patient's whole history (the list itself is capped). */
export interface AttendanceTotalsDTO {
  arrived: number;
  noShow: number;
  unmarked: number;
}

// Rows visible before "Zobraziť všetky".
const PREVIEW = 5;

/**
 * História termínov in the patient detail: past termíny with whether the
 * patient came (✔ Prišiel / Vybavený) or not (✖ Neprišiel), plus the totals.
 */
export function PatientHistory({
  history,
  totals,
}: {
  history: HistoryDTO[];
  totals: AttendanceTotalsDTO;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = totals.arrived + totals.noShow + totals.unmarked;
  const shown = expanded ? history : history.slice(0, PREVIEW);

  return (
    <section className="mb-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          História termínov
        </p>
        {total > 0 && (
          <p className="flex flex-wrap items-center gap-x-2.5 text-xs font-medium tabular-nums">
            <span className="inline-flex items-center gap-0.5 text-green-700">
              <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" />
              prišiel {totals.arrived}×
            </span>
            <span className="inline-flex items-center gap-0.5 text-red-600">
              <X className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" />
              neprišiel {totals.noShow}×
            </span>
            {totals.unmarked > 0 && (
              <span className="text-slate-400">neoznačené {totals.unmarked}×</span>
            )}
          </p>
        )}
      </div>

      {history.length === 0 ? (
        <p className="mt-1 text-xs italic text-slate-400">Zatiaľ žiadne minulé termíny.</p>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100">
          {shown.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-1 text-sm">
              <span className="min-w-0 truncate">
                <span className="tabular-nums text-slate-900">{clinicShortDate(h.date)}</span>{" "}
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {clinicTime(h.startAt)}
                </span>{" "}
                <span className="text-slate-500">
                  · {TYPE_META[h.appointmentType as AppointmentTypeLit]?.label ?? h.appointmentType}
                </span>
              </span>
              <Attendance status={h.status} />
            </li>
          ))}
        </ul>
      )}

      {history.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs font-medium text-slate-500 underline hover:text-slate-700"
        >
          {expanded ? "Zobraziť menej" : `Zobraziť všetky (${history.length})`}
        </button>
      )}
      {expanded && total > history.length && (
        <p className="mt-1 text-xs text-slate-400">
          Zobrazených posledných {history.length} z {total} termínov.
        </p>
      )}
    </section>
  );
}

function Attendance({ status }: { status: string }) {
  if (status === "ARRIVED" || status === "COMPLETED") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-green-700">
        <Check className="h-4 w-4" strokeWidth={4} aria-hidden="true" />
        {status === "ARRIVED" ? "Prišiel" : "Vybavený"}
      </span>
    );
  }
  if (status === "NO_SHOW") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-red-600">
        <X className="h-4 w-4" strokeWidth={4} aria-hidden="true" />
        Neprišiel
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-slate-400">Neoznačené</span>;
}
