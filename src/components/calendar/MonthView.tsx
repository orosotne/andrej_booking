"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  Loader2,
  Ban,
  RotateCcw,
} from "lucide-react";
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
  clinicLongDate,
  dayOfMonth,
} from "@/lib/format";
import { weekdayOf, WORKING_WEEKDAYS, buildDayMap } from "@/lib/calendar-ui";

// Ambulancia pracuje len v stredu/štvrtok/piatok — ostatné dni sa nezobrazujú.
const WEEKDAY_HEADERS = ["St", "Št", "Pi"];

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
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{
    iso: string;
    password?: string;
  } | null>(null);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [pendingReopen, setPendingReopen] = useState<string | null>(null);

  const gridStart = startOfWeek(anchor);
  // gridStart je pondelok; zobrazujeme len stredu/štvrtok/piatok (+2/+3/+4)
  // pre 6 týždňov mriežky → 18 buniek.
  const cells = useMemo(
    () =>
      Array.from({ length: 6 }, (_, w) =>
        [2, 3, 4].map((d) => isoAddDays(gridStart, w * 7 + d)),
      ).flat(),
    [gridStart],
  );

  const { data, isLoading } = useCalendar(gridStart, isoAddDays(gridStart, 41));
  const { pendingIso, openDay, closeDay, reopenDay, requiresPassword } =
    useDayActions();

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

  async function performOpen(
    iso: string,
    opts: { password?: string; overrideReason?: string } = {},
  ) {
    const result = await openDay(iso, opts);
    if (result === "ok") {
      setPendingOpen(null);
      setPendingPassword(null);
    } else if (result === "conflict") {
      setPendingPassword(null);
      setPendingOpen({ iso, password: opts.password });
    }
  }

  async function handleClose(iso: string) {
    if ((await closeDay(iso)) === "ok") setPendingClose(null);
  }
  async function handleReopen(iso: string) {
    if ((await reopenDay(iso)) === "ok") setPendingReopen(null);
  }

  // Wed + last-Fri require password; 2nd Wed of month also needs audited reason.
  function requestOpen(iso: string) {
    if (requiresPassword(iso)) {
      if (weekdayOf(iso) === 3 && openWednesdaysThisMonth > 0) {
        // We'll collect password first, then reason via the override dialog.
        setPendingPassword(iso);
      } else {
        setPendingPassword(iso);
      }
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

      <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-3 gap-1">
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
            onRequestClose={() => setPendingClose(iso)}
            onRequestReopen={() => setPendingReopen(iso)}
          />
        ))}
      </div>

      {pendingPassword && (
        <ConfirmDialog
          title={
            weekdayOf(pendingPassword) === 3
              ? "Otvoriť stredu"
              : "Otvoriť posledný piatok v mesiaci"
          }
          description="Tento deň je chránený. Zadajte heslo pre otvorenie."
          confirmLabel="Otvoriť deň"
          requirePassword
          passwordLabel="Heslo"
          onConfirm={({ password }) =>
            performOpen(pendingPassword, { password })
          }
          onClose={() => setPendingPassword(null)}
        />
      )}

      {pendingOpen && (
        <ConfirmDialog
          title="Otvoriť ďalšiu stredu?"
          description="V tomto mesiaci je už otvorená iná streda. Otvorenie ďalšej je výnimka a zaznamená sa do auditu."
          confirmLabel="Otvoriť stredu"
          requireReason
          reasonLabel="Dôvod výnimky"
          onConfirm={({ reason }) =>
            performOpen(pendingOpen.iso, {
              password: pendingOpen.password,
              overrideReason: reason,
            })
          }
          onClose={() => setPendingOpen(null)}
        />
      )}

      {pendingClose && (
        <ConfirmDialog
          title="Zatvoriť tento deň?"
          description={`${clinicLongDate(pendingClose)} sa zablokuje (napr. sviatok alebo dovolenka) — voľné sloty už nebude možné obsadiť a deň sa nebude ponúkať ako najbližší termín. Existujúce objednávky zostanú zachované.`}
          confirmLabel="Zatvoriť deň"
          tone="danger"
          onConfirm={() => handleClose(pendingClose)}
          onClose={() =>
            pendingIso === pendingClose ? undefined : setPendingClose(null)
          }
        />
      )}

      {pendingReopen && (
        <ConfirmDialog
          title="Znovu otvoriť tento deň?"
          description={`${clinicLongDate(pendingReopen)} sa znovu sprístupní — voľné sloty bude opäť možné obsadiť podľa pravidiel uvoľňovania.`}
          confirmLabel="Znovu otvoriť"
          onConfirm={() => handleReopen(pendingReopen)}
          onClose={() =>
            pendingIso === pendingReopen ? undefined : setPendingReopen(null)
          }
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
  onRequestClose,
  onRequestReopen,
}: {
  iso: string;
  inMonth: boolean;
  day: CalendarDayDTO | undefined;
  canManage: boolean;
  opening: boolean;
  loading: boolean;
  onOpen: () => void;
  onPick: () => void;
  onRequestClose: () => void;
  onRequestReopen: () => void;
}) {
  const dow = weekdayOf(iso);
  const isWorking = WORKING_WEEKDAYS.includes(dow);
  const isToday = iso === todayIso();
  const lastFriday = dow === 5 && isLastFridayOfMonth(dateOnly(iso));
  // Mirror the week/day view: a generated day (not a manual Wednesday) can be
  // closed for holidays/vacation; a CLOSED one can be reopened.
  const canClose =
    canManage &&
    !!day &&
    day.dayType !== "MANUAL_WEDNESDAY" &&
    day.status !== "CLOSED";
  const canReopen =
    canManage &&
    !!day &&
    day.dayType !== "MANUAL_WEDNESDAY" &&
    day.status === "CLOSED";

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

  // Working day with generated slots → clickable summary (+ close/reopen control).
  if (day && day.slots.length > 0) {
    const s = summarize(day);
    const closed = day.status === "CLOSED";
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onPick}
          className={`${base} w-full ${
            closed
              ? "border-amber-200 bg-amber-50/50"
              : "border-slate-200 hover:border-slate-400 hover:shadow-sm"
          }`}
        >
          <DayNumber iso={iso} isToday={isToday} muted={closed} />
          <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
            {closed ? (
              <>
                <p className="flex items-center gap-0.5 font-medium text-amber-700">
                  <Ban className="h-3 w-3" />
                  Zatvorené
                </p>
                {s.booked > 0 && <p className="text-slate-500">{s.booked} obj.</p>}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </button>
        {canReopen && (
          <button
            type="button"
            onClick={onRequestReopen}
            aria-label="Znovu otvoriť deň"
            title="Znovu otvoriť deň"
            className="absolute right-1 top-1 z-10 rounded-md bg-white/80 p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        {canClose && (
          <button
            type="button"
            onClick={onRequestClose}
            aria-label="Zatvoriť deň"
            title="Zatvoriť deň (sviatok / dovolenka)"
            className="absolute right-1 top-1 z-10 rounded-md bg-white/80 p-1 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  // Working day, not generated yet.
  return (
    <div className={`${base} border-dashed border-slate-200`}>
      <DayNumber iso={iso} isToday={isToday} />
      {loading ? null : canManage ? (
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
          {dow === 3 || lastFriday ? "Otvoriť" : "Generovať"}
        </button>
      ) : (
        <p className="mt-1 text-[10px] text-slate-300">
          {dow === 3 || lastFriday ? "zatvorená" : "—"}
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
