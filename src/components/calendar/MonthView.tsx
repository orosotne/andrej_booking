"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Lock,
  Plus,
  Loader2,
  Ban,
  RotateCcw,
  Check,
  AlertTriangle,
  Search,
} from "lucide-react";
import type { CalendarDayDTO } from "@/lib/api-types";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";
import { useCalendar, useCalendarStats } from "@/hooks/useCalendar";
import { useDayActions } from "@/hooks/useDayActions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
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
  clinicTime,
  clinicDayChip,
  dayOfMonth,
  CLINIC_MONTHS_SHORT,
} from "@/lib/format";
import {
  weekdayOf,
  WORKING_WEEKDAYS,
  buildDayMap,
  countSlots,
  availByType,
} from "@/lib/calendar-ui";
import { TYPE_META } from "@/lib/slot-style";
import { holidayName } from "@/lib/holidays-sk";
import { CalendarPrint, type PrintGroup } from "./CalendarPrint";
import { SlotTally, SlotAvailByType } from "./SlotTally";

type AttendanceEntry = {
  appointmentId: string;
  dayIso: string;
  startAt: string;
  lastName: string;
  firstName: string;
  phone: string | null;
  appointmentType: AppointmentTypeLit;
};

// Ambulancia pracuje len v stredu/štvrtok/piatok — ostatné dni sa nezobrazujú.
const WEEKDAY_HEADERS = ["St", "Št", "Pi"];

function summarize(day: CalendarDayDTO) {
  let available = 0;
  let booked = 0;
  let locked = 0;
  let arrived = 0;
  let noShow = 0;
  let completed = 0;
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
    } else if (s.status === "BOOKED") {
      booked++;
      if (s.appointment?.status === "ARRIVED") arrived++;
      else if (s.appointment?.status === "NO_SHOW") noShow++;
      else if (s.appointment?.status === "COMPLETED") completed++;
    } else if (s.status === "LOCKED") locked++;
  }
  const earliestLocked = day.slots
    .filter((s) => s.status === "LOCKED" && s.releaseAt)
    .map((s) => s.releaseAt!.slice(0, 10))
    .sort()[0];
  return {
    available,
    booked,
    locked,
    arrived,
    noShow,
    completed,
    earliestLocked,
    avail: { akut, disp, echo },
  };
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
  const [attendanceList, setAttendanceList] = useState<
    "arrived" | "noShow" | null
  >(null);

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
  const { monthCounts, monthAvail } = useMemo(() => {
    const monthSlots = (data?.days ?? [])
      .filter((d) => monthOf(d.date) === monthOf(anchor))
      .flatMap((d) => d.slots);
    return {
      monthCounts: countSlots(monthSlots),
      monthAvail: availByType(monthSlots),
    };
  }, [data, anchor]);
  const monthHasSlots =
    monthCounts.available + monthCounts.booked + monthCounts.locked > 0;
  const year = anchor.slice(0, 4);
  const yearStats = useCalendarStats(`${year}-01-01`, `${year}-12-31`);

  // Per-appointment lists for the month: who arrived, who didn't show. Drives the
  // clickable summary pills and the searchable dialog below the month grid.
  const monthAttendance = useMemo(() => {
    const arrived: AttendanceEntry[] = [];
    const noShow: AttendanceEntry[] = [];
    for (const day of data?.days ?? []) {
      if (monthOf(day.date) !== monthOf(anchor)) continue;
      for (const slot of day.slots) {
        if (slot.status !== "BOOKED" || !slot.appointment) continue;
        const a = slot.appointment;
        if (a.status !== "ARRIVED" && a.status !== "NO_SHOW") continue;
        const entry: AttendanceEntry = {
          appointmentId: a.id,
          dayIso: day.date,
          startAt: slot.startAt,
          lastName: a.patient.lastName,
          firstName: a.patient.firstName,
          phone: a.patient.phone,
          appointmentType: slot.appointmentType,
        };
        (a.status === "ARRIVED" ? arrived : noShow).push(entry);
      }
    }
    const byStart = (x: AttendanceEntry, y: AttendanceEntry) =>
      x.startAt.localeCompare(y.startAt);
    arrived.sort(byStart);
    noShow.sort(byStart);
    return { arrived, noShow };
  }, [data, anchor]);

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
        <MonthPicker
          anchor={anchor}
          onPick={(iso) => setAnchor(startOfMonth(iso))}
        />
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
        <SlotAvailByType counts={monthAvail} />
        {(monthAttendance.arrived.length > 0 ||
          monthAttendance.noShow.length > 0) && (
          <div className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200">
            <span className="font-medium text-slate-500">Návštevnosť:</span>
            {monthAttendance.arrived.length > 0 && (
              <button
                type="button"
                onClick={() => setAttendanceList("arrived")}
                className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
              >
                <Check className="h-3.5 w-3.5" />
                {monthAttendance.arrived.length}{" "}
                <span className="font-normal text-slate-500">prišli</span>
              </button>
            )}
            {monthAttendance.arrived.length > 0 &&
              monthAttendance.noShow.length > 0 && (
                <span aria-hidden className="text-slate-300">
                  ·
                </span>
              )}
            {monthAttendance.noShow.length > 0 && (
              <button
                type="button"
                onClick={() => setAttendanceList("noShow")}
                className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 font-semibold text-orange-700 transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600/40"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {monthAttendance.noShow.length}{" "}
                <span className="font-normal text-slate-500">neprišli</span>
              </button>
            )}
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

      {attendanceList && (
        <AttendanceListDialog
          kind={attendanceList}
          entries={
            attendanceList === "arrived"
              ? monthAttendance.arrived
              : monthAttendance.noShow
          }
          monthLabel={clinicMonthLabel(anchor)}
          onClose={() => setAttendanceList(null)}
        />
      )}
      </div>
      <CalendarPrint period="month" periodLabel={clinicMonthLabel(anchor)} groups={printGroups} />
    </>
  );
}

function MonthPicker({
  anchor,
  onPick,
}: {
  anchor: string;
  onPick: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(anchor.slice(0, 4)));
  const selYear = Number(anchor.slice(0, 4));
  const selMonth = Number(anchor.slice(5, 7));

  // Re-sync the displayed year when the month changes via arrows while closed.
  useEffect(() => {
    if (!open) setYear(Number(anchor.slice(0, 4)));
  }, [anchor, open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-lg font-semibold capitalize text-slate-900 transition hover:bg-slate-100"
      >
        {clinicMonthLabel(anchor)}
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Predošlý rok"
                onClick={() => setYear((y) => y - 1)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-slate-800 tabular-nums">
                {year}
              </span>
              <button
                type="button"
                aria-label="Ďalší rok"
                onClick={() => setYear((y) => y + 1)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {CLINIC_MONTHS_SHORT.map((m, i) => {
                const isSel = year === selYear && i + 1 === selMonth;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onPick(`${year}-${String(i + 1).padStart(2, "0")}-01`);
                      setOpen(false);
                    }}
                    className={[
                      "rounded-md px-2 py-1.5 text-sm font-medium capitalize transition",
                      isSel
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AttendanceListDialog({
  kind,
  entries,
  monthLabel,
  onClose,
}: {
  kind: "arrived" | "noShow";
  entries: AttendanceEntry[];
  monthLabel: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          `${e.lastName} ${e.firstName}`.toLowerCase().includes(q) ||
          (e.phone ?? "").toLowerCase().includes(q),
      )
    : entries;
  const accent =
    kind === "arrived"
      ? { fg: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" }
      : { fg: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" };
  return (
    <Modal
      title={
        kind === "arrived"
          ? `Prišli — ${monthLabel}`
          : `Neprišli — ${monthLabel}`
      }
      subtitle={`${entries.length} ${entries.length === 1 ? "záznam" : entries.length >= 2 && entries.length <= 4 ? "záznamy" : "záznamov"}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Vyhľadať pacienta</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            autoFocus
            placeholder="Priezvisko, meno alebo telefón"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </label>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {entries.length === 0
              ? "Žiadne záznamy."
              : "Žiadny zhodný výsledok."}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {filtered.map((e) => (
              <li
                key={e.appointmentId}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {e.lastName} {e.firstName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="capitalize">{clinicDayChip(e.dayIso)}</span>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {clinicTime(e.startAt)}
                    </span>
                    {" · "}
                    {TYPE_META[e.appointmentType].label}
                  </p>
                  {e.phone && (
                    <p className="mt-0.5 text-xs text-slate-400">📞 {e.phone}</p>
                  )}
                </div>
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${accent.bg} ${accent.border} ${accent.fg}`}
                  aria-hidden
                >
                  {kind === "arrived" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
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

  // Tighter padding/height on phones (the 3-col grid leaves little width, so the
  // dense per-type tallies were cramped); roomier from sm: upward.
  const base = `min-h-[72px] p-1 sm:min-h-[84px] sm:p-1.5 rounded-lg border text-left transition ${
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
                {s.booked > 0 && (
                  <p className="flex flex-wrap items-center gap-x-1 text-slate-600">
                    <span>{s.booked} obj.</span>
                    {s.completed > 0 && (
                      <span
                        className="text-emerald-800"
                        title={`${s.completed} × vybavený`}
                      >
                        {s.completed}✓✓
                      </span>
                    )}
                    {s.arrived > 0 && (
                      <span
                        className="text-emerald-700"
                        title={`${s.arrived} × prišiel`}
                      >
                        {s.arrived}✓
                      </span>
                    )}
                    {s.noShow > 0 && (
                      <span
                        className="text-orange-700"
                        title={`${s.noShow} × neprišiel`}
                      >
                        {s.noShow}✗
                      </span>
                    )}
                  </p>
                )}
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
