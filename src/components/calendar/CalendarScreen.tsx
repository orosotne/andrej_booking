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
  canManageClosures,
  initialDay,
  initialSlotId,
}: {
  isAdmin: boolean;
  canManageDays: boolean;
  canManageClosures: boolean;
  initialDay?: string;
  initialSlotId?: string;
}) {
  // A deep-linked day (e.g. /calendar?day=2026-06-20 from a patient's
  // appointment) opens straight into the day view on that date — same effect as
  // calling pickDay() on mount.
  const [view, setView] = useState<ViewMode>(initialDay ? "day" : "week");
  const [weekAnchor, setWeekAnchor] = useState<string | undefined>(
    initialDay ? startOfWeek(initialDay) : undefined,
  );
  const [dayAnchor, setDayAnchor] = useState<string | undefined>(initialDay);
  const [showRangeClose, setShowRangeClose] = useState(false);
  const invalidate = useInvalidateCalendar();

  function pickDay(iso: string) {
    setWeekAnchor(startOfWeek(iso));
    setDayAnchor(iso);
    setView("day");
  }

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
    }`;

  // One print button for all views; its label names the period that will print.
  const periodNoun = view === "day" ? "deň" : view === "month" ? "mesiac" : "týždeň";

  return (
    <div>
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
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowRangeClose(true)}
              title="Naplánovať dovolenku"
              aria-label="Naplánovať dovolenku"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <CalendarOff className="h-4 w-4" />
              <span className="hidden sm:inline">Dovolenka</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            title={`Tlačiť / Export do PDF — ${periodNoun}`}
            aria-label={`Tlačiť aktuálny pohľad (${periodNoun})`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Tlačiť {periodNoun}</span>
          </button>
        </div>
      </div>

      {view === "month" ? (
        <MonthView
          canManageDays={canManageDays}
          canManageClosures={canManageClosures}
          onPickDay={pickDay}
        />
      ) : (
        <CalendarView
          key={weekAnchor ?? "current"}
          mode={view}
          isAdmin={isAdmin}
          canManageDays={canManageDays}
          canManageClosures={canManageClosures}
          initialWeekStart={weekAnchor}
          initialDay={dayAnchor}
          highlightSlotId={initialSlotId}
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
