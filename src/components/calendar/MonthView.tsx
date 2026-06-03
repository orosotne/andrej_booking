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
import { useCalendar, useCalendarStats } from "@/hooks/useCalendar";
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
import { weekdayOf, WORKING_WEEKDAYS, buildDayMap, countSlots } from "@/lib/calendar-ui";
import { holidayName } from "@/lib/holidays-sk";
import { CalendarPrint, type PrintGroup } from "./CalendarPrint";
import { SlotTally } from "./SlotTally";

// Ambulancia pracuje len v stredu/štvrtok/piatok — ostatné dni sa nezobrazujú.
const WEEKDAY_HEADERS = ["St", "Št", "Pi"];

function summarize(day: CalendarDayDTO) {
  let available = 0;
  let booked = 0;
  let locked = 0;
  // Available slots split by the three bookable kinds (akútne / dispenzárne /
  // echo) so a month cell shows what's still free per type, not just a total.
  let akut = 0;
  let disp = 0;
  let echo = 0;
  for (const s of day.slots) {
    if (s.status === "AVAILABLE") {
      available++;
      if (s.appointmentType === "PRE_HOSPITAL" || s.appointmentType === "ACUTE_RESERVE")
        akut++;
      else if (s.appointmentType === "DISPENSARY") disp++;
      else if (s.appointmentType === "ECHO") echo++;
    } else if (s.status === "BOOKED") booked++;
    else if (s.status === "LOCKED") locked++;
  }
  const earliestLocked = day.slots
    .filter((s) => s.status === "LOCKED" && s.releaseAt)
    .map((s) => s.releaseAt!.slice(0, 10))
    .sort()[0];
  return { available, booked, locked, earliestLocked, avail: { akut, disp, echo } };
}

export function MonthView({
  canManageDays,
  canManageClosures,
  onPickDay,
}: {
  canManageDays: boolean;
  canManageClosures: boolean;
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

  // Totals above the grid: this month (from the loaded grid data) and the whole
  // year (one tiny aggregate query). Year "voľné" is naturally small — far-future
  // slots are still LOCKED — so booked is the headline number.
  const monthCounts = useMemo(() => {
    const monthSlots = (data?.days ?? [])
      .filter((d) => monthOf(d.date) === monthOf(anchor))
      .flatMap((d) => d.slots);
    const base = countSlots(monthSlots);
    let akut = 0;
    let disp = 0;
    let echo = 0;
    for (const s of monthSlots) {
      if (s.status !== "AVAILABLE") continue;
      if (s.appointmentType === "PRE_HOSPITAL" || s.appointmentType === "ACUTE_RESERVE")
        akut++;
      else if (s.appointmentType === "DISPENSARY") disp++;
      else if (s.appointmentType === "ECHO") echo++;
    }
    return { ...base, avail: { akut, disp, echo } };
  }, [data, anchor]);
  const monthHasSlots =
    monthCounts.available + monthCounts.booked + monthCounts.locked > 0;
  const monthHasAvail = monthCounts.available > 0;
  const year = anchor.slice(0, 4);
  const yearStats = useCalendarStats(`${year}-01-01`, `${year}-12-31`);

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

  async function handleClose(iso: string, password?: string) {
    if ((await closeDay(iso, password)) === "ok") setPendingClose(null);
  }
  async function handleReopen(iso: string, password?: string) {
    if ((await reopenDay(iso, password)) === "ok") setPendingReopen(null);
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

  // PDF/print export: this month's working days that carry slots, as a table.
  const printGroups: PrintGroup[] = cells
    .filter(
      (iso) =>
        monthOf(iso) === monthOf(anchor) && WORKING_WEEKDAYS.includes(weekdayOf(iso)),
    )
    .map((iso) => ({ iso, day: dayByIso.get(iso) }));

  return (
    <>
      <div className="no-print">
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

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {monthHasSlots && <SlotTally counts={monthCounts} label="Tento mesiac" />}
        {monthHasAvail && (
          <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200">
            <span className="font-medium text-slate-500">Z toho voľných:</span>
            <span>
              <span className="font-semibold text-pink-700">
                {monthCounts.avail.akut}
              </span>{" "}
              <span className="text-slate-500">akútne</span>
            </span>
            <span aria-hidden className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-emerald-700">
                {monthCounts.avail.disp}
              </span>{" "}
              <span className="text-slate-500">dispenzárne</span>
            </span>
            <span aria-hidden className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-blue-700">
                {monthCounts.avail.echo}
              </span>{" "}
              <span className="text-slate-500">ECHO</span>
            </span>
          </div>
        )}
        <span className="text-sm text-slate-500">
          Za rok {year}:{" "}
          <span className="font-semibold text-slate-700">
            {yearStats.data ? yearStats.data.booked : "…"}
          </span>{" "}
          obsadených
          {yearStats.data ? ` (${yearStats.data.available} voľných)` : ""}
        </span>
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
            canManageClosures={canManageClosures}
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
              : weekdayOf(pendingPassword) === 5 &&
                  isLastFridayOfMonth(dateOnly(pendingPassword))
                ? "Otvoriť posledný piatok v mesiaci"
                : "Otvoriť deň"
          }
          description={
            holidayName(pendingPassword)
              ? `Tento deň je sviatok (${holidayName(pendingPassword)}). Otvorenie je výnimočné — zadajte heslo.`
              : "Tento deň je chránený. Zadajte heslo pre otvorenie."
          }
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
          requirePassword
          passwordLabel="Heslo"
          onConfirm={({ password }) => handleClose(pendingClose, password)}
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
          requirePassword
          passwordLabel="Heslo"
          onConfirm={({ password }) => handleReopen(pendingReopen, password)}
          onClose={() =>
            pendingIso === pendingReopen ? undefined : setPendingReopen(null)
          }
        />
      )}
      </div>
      <CalendarPrint period="month" periodLabel={clinicMonthLabel(anchor)} groups={printGroups} />
    </>
  );
}

function DayCell({
  iso,
  inMonth,
  day,
  canManage,
  canManageClosures,
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
  canManageClosures: boolean;
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
  const holiday = isWorking ? holidayName(iso) : null;
  // Mirror the week/day view: a generated day (not a manual Wednesday) can be
  // closed for holidays/vacation; a CLOSED one can be reopened.
  const canClose =
    canManageClosures &&
    !!day &&
    day.dayType !== "MANUAL_WEDNESDAY" &&
    day.status !== "CLOSED";
  const canReopen =
    canManageClosures &&
    !!day &&
    day.dayType !== "MANUAL_WEDNESDAY" &&
    day.status === "CLOSED";

  // Graphically mark the current day in the month grid (only ever set when today
  // is one of the rendered Wed/Thu/Fri cells, so non-working days highlight nothing).
  const todayRing = isToday ? " ring-2 ring-slate-900 ring-offset-1" : "";

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
          className={`${base} w-full${todayRing} ${
            closed
              ? "border-amber-200 bg-amber-50/50"
              : "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400 hover:shadow-sm"
          }`}
        >
          <DayNumber iso={iso} isToday={isToday} muted={closed} open={!closed} />
          <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
            {closed ? (
              <>
                <p
                  className="flex items-center gap-0.5 font-medium text-amber-700"
                  title={day.note ?? "Zatvorené"}
                >
                  <Ban className="h-3 w-3 shrink-0" />
                  <span className="line-clamp-2 break-words">
                    {day.note?.replace(/^Sviatok:\s*/, "") ?? "Zatvorené"}
                  </span>
                </p>
                {s.booked > 0 && <p className="text-slate-500">{s.booked} obj.</p>}
              </>
            ) : (
              <>
                {s.available > 0 && (
                  <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 font-medium">
                    {s.avail.akut > 0 && (
                      <span className="text-pink-700">{s.avail.akut} ak.</span>
                    )}
                    {s.avail.disp > 0 && (
                      <span className="text-emerald-700">{s.avail.disp} disp.</span>
                    )}
                    {s.avail.echo > 0 && (
                      <span className="text-blue-700">{s.avail.echo} echo</span>
                    )}
                  </div>
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

  // Working day, not generated yet (incl. holidays — shown but openable only under password).
  return (
    <div
      className={`${base} border-dashed${todayRing} ${holiday ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}
    >
      <DayNumber iso={iso} isToday={isToday} muted={!!holiday} />
      {holiday && (
        <p
          className="mt-1 flex items-center gap-0.5 text-[10px] font-medium leading-tight text-amber-700"
          title={`Sviatok: ${holiday}`}
        >
          <Ban className="h-3 w-3 shrink-0" />
          <span className="line-clamp-2 break-words">{holiday}</span>
        </p>
      )}
      {loading ? null : canManage ? (
        <button
          type="button"
          onClick={onOpen}
          disabled={opening}
          className="ml-1.5 mt-1 inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {opening ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          {holiday || dow === 3 || lastFriday ? "Otvoriť" : "Generovať"}
        </button>
      ) : holiday ? null : (
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
  open,
}: {
  iso: string;
  isToday: boolean;
  muted?: boolean;
  open?: boolean;
}) {
  // Today wins (dark chip); an open day gets an emerald chip so working days
  // and their date stand out; otherwise a plain number.
  const tone = isToday
    ? "bg-slate-900 text-white"
    : open
      ? "bg-emerald-600 text-white"
      : muted
        ? "text-slate-400"
        : "text-slate-700";
  return (
    <span
      className={[
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
        tone,
      ].join(" ")}
    >
      {dayOfMonth(iso)}
    </span>
  );
}
