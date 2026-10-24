"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Printer,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrintSheet } from "@/components/ui/PrintSheet";
import { useCalendar } from "@/hooks/useCalendar";
import {
  addMonths,
  clinicMonthLabel,
  CLINIC_TZ,
  isoAddDays,
  startOfMonth,
  todayIso,
} from "@/lib/format";
import {
  buildMonthSummary,
  emptyRowLabel,
  type SummaryDay,
  type SummaryRow,
} from "@/lib/month-summary";

// "štvrtok 4. 3." — weekday spelled out, date kept short.
const dayHeadFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  weekday: "long",
  day: "numeric",
  month: "numeric",
});
const dayHead = (iso: string) => dayHeadFmt.format(new Date(`${iso}T12:00:00.000Z`));

const printedAtFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  dateStyle: "short",
  timeStyle: "short",
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function totals(days: SummaryDay[]) {
  let booked = 0;
  let free = 0;
  for (const d of days) {
    for (const r of d.rows) {
      if (r.kind === "booked") booked++;
      else if (r.kind === "free") free++;
    }
  }
  return { booked, free };
}

/**
 * Administrácia → Súhrn: one month as small per-day slot tables with each
 * patient's name, surname and phone — readable cards on screen, and the same
 * content printed small on exactly one A4 (MonthSummarySheet).
 */
export function MonthSummary() {
  const [month, setMonth] = useState(() => startOfMonth(todayIso()));
  const [printing, setPrinting] = useState(false);
  const to = isoAddDays(addMonths(month, 1), -1);
  const { data, isLoading, isError, error } = useCalendar(month, to);
  const days = useMemo(() => buildMonthSummary(data?.days), [data]);
  const { booked, free } = totals(days);
  const label = clinicMonthLabel(month);

  const navButton =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <FileText className="h-5 w-5 text-slate-400" />
          Súhrn mesiaca
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Všetky dni mesiaca so slotmi a objednanými pacientmi (meno, priezvisko,
          telefón). Tlač vloží celý mesiac drobným písmom na jednu stranu A4.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            aria-label="Predchádzajúci mesiac"
            className={navButton}
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-medium capitalize text-slate-900">
            {label}
          </span>
          <button
            type="button"
            aria-label="Nasledujúci mesiac"
            className={navButton}
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {month !== startOfMonth(todayIso()) && (
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(todayIso()))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Tento mesiac
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={isLoading || days.length === 0}
          onClick={() => setPrinting(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          Tlačiť {label} (1 × A4)
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={FileText}
          title="Súhrn sa nepodarilo načítať"
          description={error instanceof Error ? error.message : "Skúste to znova."}
        />
      ) : days.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Žiadne dni so slotmi"
          description={`V mesiaci ${label} zatiaľ nie je vygenerovaný žiadny deň.`}
        />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {days.length} dní · {booked} objednaných · {free} voľných
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {days.map((d) => (
              <DayCard key={d.iso} day={d} />
            ))}
          </div>
        </>
      )}

      {printing && (
        <PrintSheet onDone={() => setPrinting(false)}>
          <MonthSummarySheet label={label} days={days} />
        </PrintSheet>
      )}
    </div>
  );
}

function DayCard({ day }: { day: SummaryDay }) {
  return (
    <section className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
      <header className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
        <p className="text-sm font-semibold capitalize text-slate-900">{dayHead(day.iso)}</p>
        <span className="text-xs text-slate-500">{day.booked} obj.</span>
      </header>
      {day.closedNote && (
        <p className="bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
          {day.closedNote}
        </p>
      )}
      <table className="w-full text-[13px]">
        <tbody>
          {day.rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-50 first:border-t-0">
              <td className="w-px whitespace-nowrap py-0.5 pl-3 pr-2.5 align-top font-mono text-xs leading-5 tabular-nums text-slate-500">
                {r.time}
              </td>
              <td className="py-0.5 pr-2 align-top [overflow-wrap:anywhere]">
                <RowName row={r} />
              </td>
              <td className="w-px whitespace-nowrap py-0.5 pr-3 text-right align-top text-xs leading-5 tabular-nums text-slate-600">
                {r.phone ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RowName({ row }: { row: SummaryRow }) {
  if (row.kind !== "booked") {
    return <span className="text-xs text-slate-400">{emptyRowLabel(row)}</span>;
  }
  if (!row.attendance) {
    return <span className="font-medium text-slate-900">{row.name}</span>;
  }
  const arrived = row.attendance === "ARRIVED";
  return (
    <span className="font-medium text-slate-600">
      <span
        className={`line-through decoration-2 ${
          arrived ? "decoration-green-600" : "decoration-red-600"
        }`}
      >
        {row.name}
      </span>{" "}
      {arrived ? (
        <Check
          className="inline h-4 w-4 align-[-3px] text-green-600"
          strokeWidth={4}
          aria-label="Prišiel"
        />
      ) : (
        <X
          className="inline h-4 w-4 align-[-3px] text-red-600"
          strokeWidth={4}
          aria-label="Neprišiel"
        />
      )}
    </span>
  );
}

/**
 * The printed month: every day as a tiny slot table in three newspaper
 * columns, shrunk by PrintSheet onto exactly one A4 (styles: .msum-* in
 * globals.css).
 */
function MonthSummarySheet({ label, days }: { label: string; days: SummaryDay[] }) {
  const { booked, free } = totals(days);
  return (
    <div className="msum">
      <div className="msum-head">
        <div>
          <p className="msum-title">Súhrn mesiaca · {capitalize(label)}</p>
          <p className="msum-sub">Kardiologická ambulancia</p>
        </div>
        <div className="msum-meta">
          <p>
            {days.length} dní · {booked} objednaných · {free} voľných
          </p>
          <p>Vytlačené {printedAtFmt.format(new Date())}</p>
        </div>
      </div>
      <div className="msum-grid">
        {days.map((d) => (
          <section key={d.iso} className="msum-day">
            <p className="msum-day-head">
              <span>{capitalize(dayHead(d.iso))}</span>
              <span>{d.booked} obj.</span>
            </p>
            {d.closedNote && <p className="msum-closed">{d.closedNote}</p>}
            <table className="msum-table">
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id} className={r.kind === "booked" ? undefined : "msum-empty"}>
                    <td className="msum-time">{r.time}</td>
                    <td className="msum-name">
                      {r.kind === "booked" ? (
                        <>
                          <span
                            className={
                              r.attendance === "ARRIVED"
                                ? "msum-arrived"
                                : r.attendance === "NO_SHOW"
                                  ? "msum-noshow"
                                  : undefined
                            }
                          >
                            {r.name}
                          </span>
                          {r.attendance === "ARRIVED" && <span className="msum-mark-ok"> ✔</span>}
                          {r.attendance === "NO_SHOW" && <span className="msum-mark-no"> ✖</span>}
                        </>
                      ) : (
                        emptyRowLabel(r)
                      )}
                    </td>
                    <td className="msum-phone">{r.phone ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
