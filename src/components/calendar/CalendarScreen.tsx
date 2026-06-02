"use client";

import { useState } from "react";
import { Printer, CalendarOff } from "lucide-react";
import { CalendarView } from "./CalendarView";
import { MonthView } from "./MonthView";
import { NextAppointmentSearch } from "./NextAppointmentSearch";
import { RangeCloseDialog } from "./RangeCloseDialog";
import { useInvalidateCalendar } from "@/hooks/useCalendar";
import { startOfWeek } from "@/lib/format";

type ViewMode = "day" | "week" | "month";

export function CalendarScreen({
  isAdmin,
  canManageDays,
}: {
  isAdmin: boolean;
  canManageDays: boolean;
}) {
  const [view, setView] = useState<ViewMode>("week");
  const [weekAnchor, setWeekAnchor] = useState<string | undefined>(undefined);
  const [dayAnchor, setDayAnchor] = useState<string | undefined>(undefined);
  const [showRangeClose, setShowRangeClose] = useState(false);
  const invalidate = useInvalidateCalendar();

  function pickDay(iso: string) {
    setWeekAnchor(startOfWeek(iso));
    setDayAnchor(iso);
    setView("day");
  }

  function printAs(target: ViewMode) {
    setView(target);
    // Let React commit the new view, then trigger the browser print dialog.
    // The @media print rules in globals.css strip nav/tabs/buttons.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  }

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
    }`;

  const printClass =
    view === "day" ? "print-day" : view === "month" ? "print-month" : "";

  return (
    <div className={printClass}>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button type="button" className={tab(view === "day")} onClick={() => setView("day")}>
            Deň
          </button>
          <button type="button" className={tab(view === "week")} onClick={() => setView("week")}>
            Týždeň
          </button>
          <button type="button" className={tab(view === "month")} onClick={() => setView("month")}>
            Mesiac
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <NextAppointmentSearch onPickDay={pickDay} />
          {canManageDays && (
            <button
              type="button"
              onClick={() => setShowRangeClose(true)}
              title="Zatvoriť rozsah dní (dovolenka)"
              aria-label="Zatvoriť rozsah dní (dovolenka)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <CalendarOff className="h-4 w-4" />
              <span className="hidden sm:inline">Dovolenka</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => printAs("day")}
            title="Tlačiť aktuálny deň"
            aria-label="Tlačiť deň"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Tlač deň</span>
          </button>
          <button
            type="button"
            onClick={() => printAs("month")}
            title="Tlačiť aktuálny mesiac"
            aria-label="Tlačiť mesiac"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Tlač mesiac</span>
          </button>
        </div>
      </div>

      {view === "month" ? (
        <MonthView canManageDays={canManageDays} onPickDay={pickDay} />
      ) : (
        <CalendarView
          key={weekAnchor ?? "current"}
          mode={view}
          isAdmin={isAdmin}
          canManageDays={canManageDays}
          initialWeekStart={weekAnchor}
          initialDay={dayAnchor}
        />
      )}

      {showRangeClose && (
        <RangeCloseDialog
          onClose={() => setShowRangeClose(false)}
          onDone={() => {
            setShowRangeClose(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}
