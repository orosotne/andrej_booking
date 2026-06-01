"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Plus, Loader2 } from "lucide-react";
import type { CalendarDayDTO } from "@/lib/api-types";
import { useCalendar } from "@/hooks/useCalendar";
import { useDayActions } from "@/hooks/useDayActions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isLastFridayOfMonth, dateOnly } from "@/lib/calendar-date";
import {
  startOfWeek,
  startOfMonth,
  addMonths,
  isoAddDays,
  monthOf,
  todayIso,
  clinicMonthLabel,
  dayOfMonth,
} from "@/lib/format";
import { weekdayOf, WORKING_WEEKDAYS, buildDayMap } from "@/lib/calendar-ui";

const WEEKDAY_HEADERS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

function summarize(day: CalendarDayDTO) {
  let available = 0;
  let booked = 0;
  let locked = 0;
  for (const s of day.slots) {
    if (s.status === "AVAILABLE") available++;
    else if (s.status === "BOOKED") booked++;
    else if (s.status === "LOCKED") locked++;
  }
  const earliestLocked = day.slots
    .filter((s) => s.status === "LOCKED" && s.releaseAt)
    .map((s) => s.releaseAt!.slice(0, 10))
    .sort()[0];
  return { available, booked, locked, earliestLocked };
}

export function MonthView({
  canManageDays,
  onPickDay,
}: {
  canManageDays: boolean;
  onPickDay: (iso: string) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfMonth(todayIso()));
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);

  const gridStart = startOfWeek(anchor);
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => isoAddDays(gridStart, i)),
    [gridStart],
  );

  const { data, isLoading } = useCalendar(gridStart, isoAddDays(gridStart, 41));
  const { pendingIso, openDay } = useDayActions();

  const dayByIso = useMemo(() => buildDayMap(data?.days), [data]);

  const openWednesdaysThisMonth = useMemo(
    () =>
      (data?.days ?? []).filter(
        (d) =>
          monthOf(d.date) === monthOf(anchor) &&
          weekdayOf(d.date) === 3 &&
          d.slots.length > 0,
      ).length,
    [data, anchor],
  );

  async function performOpen(iso: string, overrideReason?: string) {
    const result = await openDay(iso, overrideReason);
    if (result === "ok") setPendingOpen(null);
    else if (result === "conflict") setPendingOpen(iso);
  }

  // A second Wednesday in the same month needs an audited override reason.
  function requestOpen(iso: string) {
    if (weekdayOf(iso) === 3 && openWednesdaysThisMonth > 0) {
      setPendingOpen(iso);
    } else {
      performOpen(iso);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize text-slate-900">
          {clinicMonthLabel(anchor)}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="mr-1"
            onClick={() => setAnchor(startOfMonth(todayIso()))}
          >
            Tento mesiac
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="px-2"
            aria-label="Predošlý mesiac"
            onClick={() => setAnchor(addMonths(anchor, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="px-2"
            aria-label="Ďalší mesiac"
            onClick={() => setAnchor(addMonths(anchor, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso) => (
          <DayCell
            key={iso}
            iso={iso}
            inMonth={monthOf(iso) === monthOf(anchor)}
            day={dayByIso.get(iso)}
            canManage={canManageDays}
            opening={pendingIso === iso}
            loading={isLoading}
            onOpen={() => requestOpen(iso)}
            onPick={() => onPickDay(iso)}
          />
        ))}
      </div>

      {pendingOpen && (
        <ConfirmDialog
          title="Otvoriť ďalšiu stredu?"
          description="V tomto mesiaci je už otvorená iná streda. Otvorenie ďalšej je výnimka a zaznamená sa do auditu."
          confirmLabel="Otvoriť stredu"
          requireReason
          reasonLabel="Dôvod výnimky"
          onConfirm={(reason) => performOpen(pendingOpen, reason)}
          onClose={() => setPendingOpen(null)}
        />
      )}
    </div>
  );
}

function DayCell({
  iso,
  inMonth,
  day,
  canManage,
  opening,
  loading,
  onOpen,
  onPick,
}: {
  iso: string;
  inMonth: boolean;
  day: CalendarDayDTO | undefined;
  canManage: boolean;
  opening: boolean;
  loading: boolean;
  onOpen: () => void;
  onPick: () => void;
}) {
  const dow = weekdayOf(iso);
  const isWorking = WORKING_WEEKDAYS.includes(dow);
  const isToday = iso === todayIso();
  const lastFriday = dow === 5 && isLastFridayOfMonth(dateOnly(iso));

  const base = `min-h-[84px] rounded-lg border p-1.5 text-left transition ${
    inMonth ? "bg-white" : "bg-transparent opacity-40"
  }`;

  if (!isWorking) {
    return (
      <div className={`${base} border-slate-100`}>
        <DayNumber iso={iso} isToday={isToday} muted />
      </div>
    );
  }

  // Working day with generated slots → clickable summary.
  if (day && day.slots.length > 0) {
    const s = summarize(day);
    return (
      <button
        type="button"
        onClick={onPick}
        className={`${base} w-full border-slate-200 hover:border-slate-400 hover:shadow-sm`}
      >
        <DayNumber iso={iso} isToday={isToday} />
        <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
          {s.available > 0 && (
            <p className="font-medium text-emerald-700">{s.available} voľné</p>
          )}
          {s.booked > 0 && <p className="text-slate-600">{s.booked} obj.</p>}
          {s.locked > 0 && (
            <p className="flex items-center gap-0.5 text-slate-400">
              <Lock className="h-3 w-3" />
              {s.locked}
            </p>
          )}
        </div>
      </button>
    );
  }

  // Working day, not generated yet.
  return (
    <div className={`${base} border-dashed border-slate-200`}>
      <DayNumber iso={iso} isToday={isToday} />
      {lastFriday ? (
        <p className="mt-1 flex items-center gap-0.5 text-[10px] text-amber-600">
          <Lock className="h-3 w-3" />
          {isoAddDays(iso, -30).slice(5)}
        </p>
      ) : loading ? null : canManage ? (
        <button
          type="button"
          onClick={onOpen}
          disabled={opening}
          className="mt-1 inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {opening ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          {dow === 3 ? "Otvoriť" : "Generovať"}
        </button>
      ) : (
        <p className="mt-1 text-[10px] text-slate-300">
          {dow === 3 ? "zatvorená" : "—"}
        </p>
      )}
    </div>
  );
}

function DayNumber({
  iso,
  isToday,
  muted,
}: {
  iso: string;
  isToday: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
        isToday ? "bg-slate-900 text-white" : muted ? "text-slate-400" : "text-slate-700",
      ].join(" ")}
    >
      {dayOfMonth(iso)}
    </span>
  );
}
