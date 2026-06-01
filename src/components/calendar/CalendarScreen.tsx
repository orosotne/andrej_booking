"use client";

import { useState } from "react";
import { CalendarView } from "./CalendarView";
import { MonthView } from "./MonthView";
import { startOfWeek } from "@/lib/format";

export function CalendarScreen({
  isAdmin,
  canManageDays,
}: {
  isAdmin: boolean;
  canManageDays: boolean;
}) {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [weekAnchor, setWeekAnchor] = useState<string | undefined>(undefined);
  const [dayAnchor, setDayAnchor] = useState<string | undefined>(undefined);

  function pickDay(iso: string) {
    setWeekAnchor(startOfWeek(iso));
    setDayAnchor(iso);
    setView("week");
  }

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
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
    </div>
  );
}
