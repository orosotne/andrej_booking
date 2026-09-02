"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  isoWeekNumber,
  CLINIC_MONTHS_SHORT,
} from "@/lib/format";
import {
  weekdayOf,
  WORKING_WEEKDAYS,
  buildDayMap,
  monthGridCells,
  monthStrip,
  tallyDayByType,
  openDayPasswordText,
  type TypeTally,
} from "@/lib/calendar-ui";
import { cn } from "@/lib/cn";
import { TYPE_META } from "@/lib/slot-style";
import { holidayName } from "@/lib/holidays-sk";
import { CalendarPrint, type PrintGroup } from "./CalendarPrint";

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
  // Wed/Thu/Fri of the anchor month only; null = a neighbouring month's day
  // that has to hold its column. See monthGridCells.
  const cells = monthGridCells(anchor);
  // One row per week: [Wed, Thu, Fri], prefixed in the grid by the ISO week no.
  const weekRows = Array.from({ length: cells.length / 3 }, (_, w) =>
    cells.slice(w * 3, w * 3 + 3),
  );

  const { data, isLoading } = useCalendar(gridStart, isoAddDays(gridStart, 41));
  const { pendingIso, openDay, closeDay, reopenDay, requiresPassword } =
    useDayActions();

  const dayByIso = useMemo(() => buildDayMap(data?.days), [data]);

  // Per-day per-type counts for the cells, computed once per payload instead of
  // once per cell per render.
  const tallyByIso = useMemo(() => {
    const m = new Map<string, DayTally>();
    (data?.days ?? []).forEach((d) => m.set(d.date, tallyDayByType(d.slots)));
    return m;
  }, [data]);

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

  // Totals above the grid: this month per type, with exactly the cells' logic
  // (free / locked / booked; PENTA and "iné" excluded), so the strip is the sum
  // of the cells below it. The whole year is one tiny aggregate query. Year
  // "voľné" is naturally small — far-future slots are still LOCKED — so booked
  // is the headline number.
  const monthTally = useMemo(
    () =>
      tallyDayByType(
        (data?.days ?? [])
          .filter((d) => monthOf(d.date) === monthOf(anchor))
          .flatMap((d) => d.slots),
      ),
    [data, anchor],
  );
  const monthHasSlots = (["akut", "disp", "echo"] as const).some(
    (k) =>
      monthTally[k].free + monthTally[k].locked + monthTally[k].booked > 0,
  );
  // Quick-jump strip: 15 months from today's month. Anchored on today, not on
  // the viewed month, so it only moves when the calendar month rolls over.
  const stripMonths = useMemo(() => monthStrip(todayIso()), []);
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
      (iso): iso is string =>
        iso !== null && WORKING_WEEKDAYS.includes(weekdayOf(iso)),
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

      {/* 15 black squares, one per month from the current one, numbered by
          month-of-year. The viewed month (if inside the strip) reads yellow. */}
      <div
        role="group"
        aria-label="Rýchly výber mesiaca"
        className="mt-2 grid max-w-[640px] grid-cols-15 gap-0.5 sm:gap-1"
      >
        {stripMonths.map((iso) => {
          const selected = iso === anchor;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setAnchor(iso)}
              aria-label={clinicMonthLabel(iso)}
              aria-pressed={selected}
              className={cn(
                "flex aspect-square items-center justify-center rounded bg-slate-900 text-xs font-semibold tabular-nums transition hover:bg-slate-700 sm:text-sm",
                selected ? "text-yellow-400" : "text-white",
              )}
            >
              {Number(iso.slice(5, 7))}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {monthHasSlots && (
          <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200">
            <span className="font-medium text-slate-500">Tento mesiac:</span>
            <TypeRow tally={monthTally.akut} freeClass="text-red-700" label="Akútne" />
            <TypeRow tally={monthTally.disp} freeClass="text-emerald-700" label="Dispenzárne" />
            <TypeRow tally={monthTally.echo} freeClass="text-blue-700" label="ECHO" />
          </div>
        )}
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

      {/* Wednesday is a narrow vertical cell, Thu/Fri wide horizontal ones, so
          the columns run 1:3:3. Header and grid must share the template or the
          St/Št/Pi labels drift off their columns. The width cap keeps the fixed
          aspect ratios from making the month absurdly tall on a wide screen. */}
      <div className="mx-auto mt-3 w-full max-w-[640px]">
        <div className={`grid ${MONTH_GRID_COLS} gap-1 text-center text-xs font-medium uppercase tracking-wide text-slate-400`}>
          <div aria-hidden />
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="py-1">
              {h}
            </div>
          ))}
        </div>

        <div className={`mt-1 grid ${MONTH_GRID_COLS} gap-1`}>
          {weekRows.map((row, w) => {
            // Every cell of a row shares its ISO week; at least one is a real
            // day (monthGridCells drops all-foreign weeks).
            const weekIso = row.find((iso) => iso !== null)!;
            return (
              <Fragment key={weekIso}>
                <div
                  className="flex items-center justify-end pr-0.5 text-xs font-medium tabular-nums text-slate-400"
                  title={`${isoWeekNumber(weekIso)}. týždeň`}
                >
                  {isoWeekNumber(weekIso)}.
                </div>
                {row.map((iso, i) =>
                  iso === null ? (
                    // Spacer for a neighbouring month's day: keeps the weekday
                    // columns aligned without showing a foreign date.
                    <div
                      key={`gap-${w}-${i}`}
                      aria-hidden
                      className={i === 0 ? "aspect-[1/2]" : "aspect-[3/2]"}
                    />
                  ) : (
                    <DayCell
                      key={iso}
                      iso={iso}
                      day={dayByIso.get(iso)}
                      tally={tallyByIso.get(iso)}
                      canManage={canManageDays}
                      canManageClosures={canManageClosures}
                      opening={pendingIso === iso}
                      loading={isLoading}
                      onOpen={() => requestOpen(iso)}
                      onPick={() => onPickDay(iso)}
                      onRequestClose={() => setPendingClose(iso)}
                      onRequestReopen={() => setPendingReopen(iso)}
                    />
                  ),
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {pendingPassword && (
        <ConfirmDialog
          title={openDayPasswordText(pendingPassword).title}
          description={openDayPasswordText(pendingPassword).description}
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

/**
 * Aspect ratios that pair with MONTH_GRID_COLS: with columns at 1:3:3, a
 * Wednesday at 1:2 and a Thu/Fri at 3:2 resolve to exactly the same height
 * (2 fr units), for any gap — so every grid row lines up. minmax(0,…) stops a
 * wide child from inflating a track and breaking the ratio. The leading auto
 * column holds the ISO week number and takes no part in the ratio.
 */
const MONTH_GRID_COLS =
  "grid-cols-[auto_minmax(0,1fr)_minmax(0,3fr)_minmax(0,3fr)]";

/**
 * Shared cell surface. min-h-0 + overflow-hidden keep content inside the aspect
 * box. The background stays white for every state — the border carries the
 * state, so the counts sit on a consistent, quiet ground.
 */
const CELL_SHELL =
  "flex h-full w-full min-h-0 overflow-hidden rounded-lg border bg-white p-1 text-left transition sm:p-1.5";

type DayTally = ReturnType<typeof tallyDayByType>;

const EMPTY_TALLY: DayTally = {
  akut: { free: 0, locked: 0, booked: 0 },
  disp: { free: 0, locked: 0, booked: 0 },
  echo: { free: 0, locked: 0, booked: 0 },
};

/**
 * One type row of a month cell: free count (hidden at zero, coloured by type),
 * then still-locked and already-booked counts in grey — those two always show,
 * zero included, so the three rows keep a stable shape. The free count sits in
 * a fixed-width slot so the lock and the tick stay put whether or not there is
 * a number in front of them. The icons are decorative; the row's title carries
 * the meaning. `freeSizeClass` lets one row (dispenzárne) run a larger digit.
 */
function TypeRow({
  tally,
  freeClass,
  freeSizeClass,
  label,
}: {
  tally: TypeTally;
  freeClass: string;
  freeSizeClass?: string;
  label: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-1 text-[11px] leading-none sm:gap-1.5 sm:text-base"
      title={`${label}: ${tally.free} voľné, ${tally.locked} zamknuté, ${tally.booked} obsadené`}
    >
      <span
        className={cn(
          "w-5 shrink-0 font-bold tabular-nums sm:w-8",
          freeClass,
          freeSizeClass,
        )}
      >
        {tally.free > 0 ? tally.free : ""}
      </span>
      <span className="inline-flex items-center gap-0.5 text-slate-500">
        <Lock aria-hidden className="h-3 w-3 shrink-0 text-slate-400 sm:h-4 sm:w-4" />
        <span className="tabular-nums">{tally.locked}</span>
      </span>
      <span className="ml-1 inline-flex items-center gap-0.5 text-slate-500 sm:ml-2">
        <Check aria-hidden className="h-3 w-3 shrink-0 text-slate-400 sm:h-4 sm:w-4" />
        <span className="tabular-nums">{tally.booked}</span>
      </span>
    </div>
  );
}

/** The three rows of an open Thu/Fri cell, in fixed order (position = type). */
function TypeRows({ tally }: { tally: DayTally }) {
  return (
    <div className="grid h-full grid-rows-3 items-center">
      <TypeRow tally={tally.akut} freeClass="text-red-700" label="Akútne" />
      <TypeRow
        tally={tally.disp}
        freeClass="text-emerald-700"
        freeSizeClass="text-sm sm:text-[1.3rem]"
        label="Dispenzárne"
      />
      <TypeRow tally={tally.echo} freeClass="text-blue-700" label="ECHO" />
    </div>
  );
}

/** Screen-reader summary — the raw digits would otherwise read as noise. */
function tallyAriaLabel(iso: string, t: DayTally): string {
  return (
    `${clinicLongDate(iso)} — akútne ${t.akut.free} voľné, ` +
    `dispenzárne ${t.disp.free} voľné, echo ${t.echo.free} voľné`
  );
}

function DayCell({
  iso,
  day,
  tally,
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
  day: CalendarDayDTO | undefined;
  tally: DayTally | undefined;
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
  const isToday = iso === todayIso();
  // Mirror the week/day view: a generated day (not a manual Wednesday) can be
  // closed for holidays/vacation; a CLOSED one can be reopened. Both conditions
  // exclude Wednesdays, so the narrow cell never has to host these buttons.
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

  return (
    <div
      className={cn(
        "relative rounded-lg",
        dow === 3 ? "aspect-[1/2]" : "aspect-[3/2]",
        isToday && "ring-2 ring-slate-900 ring-offset-1",
      )}
    >
      {dow === 3 ? (
        <WednesdayCell
          iso={iso}
          day={day}
          canManage={canManage}
          opening={opening}
          loading={loading}
          onOpen={onOpen}
          onPick={onPick}
        />
      ) : (
        <WorkdayCell
          iso={iso}
          day={day}
          tally={tally ?? EMPTY_TALLY}
          canManage={canManage}
          opening={opening}
          loading={loading}
          onOpen={onOpen}
          onPick={onPick}
        />
      )}
      {canReopen && (
        <button
          type="button"
          onClick={onRequestReopen}
          aria-label="Znovu otvoriť deň"
          title="Znovu otvoriť deň"
          className="absolute bottom-1 left-1 z-10 rounded-md bg-white/80 p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
        >
          <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      )}
      {canClose && (
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="Zatvoriť deň"
          title="Zatvoriť deň (sviatok / dovolenka)"
          className="absolute bottom-1 left-1 z-10 rounded-md bg-white/80 p-1 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
        >
          <Ban className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * A Wednesday shows nothing but its date: light grey while the day is still
 * closed, dark purple once it has been opened by password. The number is
 * centred rather than left-aligned — in a 40–90px wide cell the "left third"
 * is narrower than a two-digit number.
 */
function WednesdayCell({
  iso,
  day,
  canManage,
  opening,
  loading,
  onOpen,
  onPick,
}: {
  iso: string;
  day: CalendarDayDTO | undefined;
  canManage: boolean;
  opening: boolean;
  loading: boolean;
  onOpen: () => void;
  onPick: () => void;
}) {
  const hasSlots = !!day && day.slots.length > 0;
  const closed = day?.status === "CLOSED";
  const opened = hasSlots && !closed;

  if (hasSlots) {
    return (
      <button
        type="button"
        onClick={onPick}
        title={closed ? (day?.note ?? "Zatvorené") : undefined}
        aria-label={`${clinicLongDate(iso)} — ${closed ? "zatvorená streda" : "otvorená streda"}`}
        className={cn(
          CELL_SHELL,
          "items-center justify-center",
          closed
            ? "border-amber-200 bg-amber-50/50"
            : "border-purple-300 bg-purple-50/40 hover:border-purple-400 hover:shadow-sm",
        )}
      >
        <DayNumber iso={iso} tone={opened ? "open" : "muted"} />
      </button>
    );
  }

  // Not opened yet. For a manager the whole cell is the "Otvoriť" target; the
  // Plus only surfaces on hover/focus so the resting cell stays bare.
  if (loading || !canManage) {
    return (
      <div
        className={cn(
          CELL_SHELL,
          "items-center justify-center border-dashed border-slate-200",
        )}
      >
        <DayNumber iso={iso} tone="muted" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={opening}
      title="Otvoriť stredu"
      aria-label={`Otvoriť stredu ${clinicLongDate(iso)}`}
      className={cn(
        CELL_SHELL,
        "group relative items-center justify-center border-dashed border-slate-200",
        "hover:border-purple-300 hover:bg-purple-50/50 disabled:opacity-50",
      )}
    >
      <DayNumber iso={iso} tone="muted" />
      <span
        className={cn(
          "absolute inset-x-0 bottom-1 flex justify-center text-slate-400 transition",
          opening
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {opening ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}

/**
 * Thursday / Friday: the date in the left third, and in the right two thirds
 * either the three per-type rows (open day), the closure note, or the
 * generate/open affordance.
 */
function WorkdayCell({
  iso,
  day,
  tally,
  canManage,
  opening,
  loading,
  onOpen,
  onPick,
}: {
  iso: string;
  day: CalendarDayDTO | undefined;
  tally: DayTally;
  canManage: boolean;
  opening: boolean;
  loading: boolean;
  onOpen: () => void;
  onPick: () => void;
}) {
  const dow = weekdayOf(iso);
  const lastFriday = dow === 5 && isLastFridayOfMonth(dateOnly(iso));
  const holiday = holidayName(iso);

  if (day && day.slots.length > 0) {
    const closed = day.status === "CLOSED";
    return (
      <button
        type="button"
        onClick={onPick}
        aria-label={
          closed
            ? `${clinicLongDate(iso)} — zatvorené${day.note ? `: ${day.note}` : ""}`
            : tallyAriaLabel(iso, tally)
        }
        className={cn(
          CELL_SHELL,
          `grid ${CELL_INNER_COLS} gap-1`,
          closed
            ? "border-amber-200"
            : "border-emerald-300 hover:border-emerald-400 hover:shadow-sm",
        )}
      >
        <div className="flex min-w-0 items-center pl-0.5">
          <DayNumber iso={iso} tone={closed ? "closed" : "open"} />
        </div>
        <div className="col-span-2 flex min-w-0 flex-col justify-center">
          {closed ? (
            <p
              className="flex items-start gap-0.5 text-[10px] font-medium leading-tight text-amber-700 sm:text-xs"
              title={day.note ?? "Zatvorené"}
            >
              <Ban className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              <span className="line-clamp-3 break-words">
                {day.note?.replace(/^Sviatok:\s*/, "") ?? "Zatvorené"}
              </span>
            </p>
          ) : (
            <TypeRows tally={tally} />
          )}
        </div>
      </button>
    );
  }

  // Working day, not generated yet (incl. holidays — shown but openable only under password).
  return (
    <div
      className={cn(
        CELL_SHELL,
        `grid ${CELL_INNER_COLS} gap-1 border-dashed`,
        holiday ? "border-amber-200" : "border-slate-200",
      )}
    >
      <div className="flex min-w-0 items-center pl-0.5">
        <DayNumber iso={iso} tone={holiday ? "closed" : "muted"} />
      </div>
      <div className="col-span-2 flex min-w-0 flex-col justify-center gap-1">
        {holiday && (
          <p
            className="flex items-start gap-0.5 text-[10px] font-medium leading-tight text-amber-700 sm:text-xs"
            title={`Sviatok: ${holiday}`}
          >
            <Ban className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
            <span className="line-clamp-2 break-words">{holiday}</span>
          </p>
        )}
        {loading ? null : canManage ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={opening}
            className="inline-flex w-fit items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:text-xs"
          >
            {opening ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            {holiday || lastFriday ? "Otvoriť" : "Generovať"}
          </button>
        ) : holiday ? null : (
          <p className="text-[10px] text-slate-300 sm:text-xs">
            {lastFriday ? "zatvorená" : "—"}
          </p>
        )}
      </div>
    </div>
  );
}

/** Inner split of a Thu/Fri cell: date in the left third, counts in the rest. */
const CELL_INNER_COLS = "grid-cols-3";

/**
 * The date, large and bold. Dark purple marks a day that is open for booking,
 * grey one that is not, amber a closed one. Today is marked by the cell's ring,
 * so the number keeps its type colour.
 */
function DayNumber({
  iso,
  tone,
}: {
  iso: string;
  tone: "open" | "muted" | "closed";
}) {
  const toneClass =
    tone === "open"
      ? "text-purple-800"
      : tone === "closed"
        ? "text-amber-700"
        : "text-slate-400";
  return (
    <span
      className={cn(
        "text-[1.625rem] font-bold leading-none tabular-nums sm:text-[2.925rem]",
        toneClass,
      )}
    >
      {dayOfMonth(iso)}
    </span>
  );
}
