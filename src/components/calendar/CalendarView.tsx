"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
  Ban,
  RotateCcw,
} from "lucide-react";
import type { CalendarDayDTO, SlotDTO } from "@/lib/api-types";
import { useCalendar, useInvalidateCalendar } from "@/hooks/useCalendar";
import { useDayActions } from "@/hooks/useDayActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlotCard } from "./SlotCard";
import { BookingDialog } from "@/components/booking/BookingDialog";
import { AppointmentActions } from "@/components/booking/AppointmentActions";
import { SlotUnlockDialog } from "@/components/booking/SlotUnlockDialog";
import {
  isoAddDays,
  startOfWeek,
  todayIso,
  clinicDayChip,
  clinicLongDate,
  isoWeekNumber,
  isoWeekYear,
  isoWeeksInYear,
  isoWeekStart,
} from "@/lib/format";
import {
  weekdayOf,
  WORKING_WEEKDAYS,
  buildDayMap,
  nextWorkingDay,
  countSlots,
  availByType,
} from "@/lib/calendar-ui";
import { isLastFridayOfMonth, dateOnly } from "@/lib/calendar-date";
import { holidayName } from "@/lib/holidays-sk";
import { CalendarPrint, type PrintGroup } from "./CalendarPrint";
import { SlotTally, SlotAvailByType } from "./SlotTally";

type Dialog =
  | { type: "book"; slot: SlotDTO; dayIso: string }
  | { type: "actions"; slot: SlotDTO; dayIso: string }
  | { type: "unlock"; slot: SlotDTO; dayIso: string }
  | null;

export function CalendarView({
  isAdmin,
  canManageDays,
  canManageClosures,
  mode = "week",
  initialWeekStart,
  initialDay,
  highlightSlotId,
}: {
  isAdmin: boolean;
  canManageDays: boolean;
  canManageClosures: boolean;
  mode?: "week" | "day";
  initialWeekStart?: string;
  initialDay?: string;
  highlightSlotId?: string;
}) {
  const [weekStart, setWeekStart] = useState(
    () => initialWeekStart ?? startOfWeek(todayIso()),
  );
  const [selectedDay, setSelectedDay] = useState(
    () => initialDay ?? todayIso(),
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingOverride, setPendingOverride] = useState<
    { iso: string; password?: string } | null
  >(null);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [pendingReopen, setPendingReopen] = useState<string | null>(null);
  // Deep-link from a patient's appointment: the slot to flash green once.
  const [flashSlotId, setFlashSlotId] = useState(highlightSlotId);

  const weekEnd = isoAddDays(weekStart, 6);
  const { data, isLoading, isError, error } = useCalendar(weekStart, weekEnd);
  const invalidate = useInvalidateCalendar();
  const { pendingIso, openDay, deleteDay, closeDay, reopenDay, requiresPassword } =
    useDayActions();

  const dayByIso = useMemo(() => buildDayMap(data?.days), [data]);

  // Once the target day's slots are rendered, scroll the booked slot into view
  // and let it flash green; clear after the animation so the highlight fades.
  useEffect(() => {
    if (!flashSlotId || isLoading || !data) return;
    document
      .getElementById(`slot-${flashSlotId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlashSlotId(undefined), 2400);
    return () => clearTimeout(t);
  }, [flashSlotId, isLoading, data]);

  // Show only working days (Wed/Thu/Fri). Non-working days are not rendered.
  const weekIsos = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => isoAddDays(weekStart, i)).filter(
        (iso) => WORKING_WEEKDAYS.includes(weekdayOf(iso)),
      ),
    [weekStart],
  );
  const workingIsos = weekIsos;

  // Mobile shows one day: the selected day if it's in this week, else the first working day.
  const mobileDay = weekIsos.includes(selectedDay) ? selectedDay : workingIsos[0];

  function handleSelect(slot: SlotDTO, dayIso: string) {
    if (slot.status === "AVAILABLE") setDialog({ type: "book", slot, dayIso });
    else if (slot.status === "BOOKED") setDialog({ type: "actions", slot, dayIso });
    else if (slot.status === "LOCKED" && isAdmin)
      setDialog({ type: "unlock", slot, dayIso });
  }

  async function handleOpen(
    iso: string,
    opts: { password?: string; overrideReason?: string } = {},
  ) {
    // Wed/last-Fri require a password — show the password dialog before calling.
    if (requiresPassword(iso) && !opts.password) {
      setPendingPassword(iso);
      return;
    }
    const result = await openDay(iso, opts);
    if (result === "ok") {
      setPendingOverride(null);
      setPendingPassword(null);
    } else if (
      result === "conflict" &&
      weekdayOf(iso) === 3 &&
      !opts.overrideReason
    ) {
      // 2nd Wednesday of month → ask for audited reason (password is already known).
      setPendingPassword(null);
      setPendingOverride({ iso, password: opts.password });
    }
  }
  async function handleDelete(iso: string) {
    if ((await deleteDay(iso)) === "ok") setPendingDelete(null);
  }
  async function handleClose(iso: string, password?: string) {
    if ((await closeDay(iso, password)) === "ok") setPendingClose(null);
  }
  async function handleReopen(iso: string, password?: string) {
    if ((await reopenDay(iso, password)) === "ok") setPendingReopen(null);
  }

  const close = () => setDialog(null);
  const afterChange = async () => {
    await invalidate();
    close();
  };

  // Day mode: one day, full focus, navigated day-by-day. weekStart stays in sync
  // so the fetched week always contains the selected day.
  const isDay = mode === "day";
  function goToDay(iso: string) {
    setSelectedDay(iso);
    setWeekStart(startOfWeek(iso));
  }
  function handlePrev() {
    if (isDay) goToDay(nextWorkingDay(selectedDay, -1));
    else setWeekStart(isoAddDays(weekStart, -7));
  }
  function handleNext() {
    if (isDay) goToDay(nextWorkingDay(selectedDay, 1));
    else setWeekStart(isoAddDays(weekStart, 7));
  }
  function handleToday() {
    if (isDay) {
      goToDay(todayIso());
    } else {
      setWeekStart(startOfWeek(todayIso()));
      setSelectedDay(todayIso());
    }
  }

  // PDF/print export (day or week): the same slots the view loaded, as a table.
  const printGroups: PrintGroup[] = isDay
    ? [{ iso: selectedDay, day: dayByIso.get(selectedDay) }]
    : weekIsos.map((iso) => ({ iso, day: dayByIso.get(iso) }));
  const printLabel = isDay
    ? clinicLongDate(selectedDay)
    : `${clinicLongDate(weekStart)} – ${clinicLongDate(weekEnd)}`;

  // Free/booked tally under the legend. The day view, when it's today, counts
  // only slots that haven't started yet ("ešte voľných"); the week view sums the
  // three working columns without the time filter.
  const isTodaySelected = isDay && selectedDay === todayIso();
  const tallySlots = isDay
    ? (dayByIso.get(selectedDay)?.slots ?? [])
    : weekIsos.flatMap((iso) => dayByIso.get(iso)?.slots ?? []);
  const tallyNow = isTodaySelected ? new Date().toISOString() : undefined;
  const tallyCounts = countSlots(tallySlots, tallyNow);
  const tallyAvail = availByType(tallySlots, tallyNow);

  return (
    <>
      <div className="no-print">
      <Header
        subtitle={
          isDay
            ? clinicLongDate(selectedDay)
            : `${clinicLongDate(weekStart)} – ${clinicLongDate(weekEnd)}`
        }
        badge={
          isDay ? undefined : (
            <WeekPicker weekStart={weekStart} onPick={setWeekStart} />
          )
        }
        prevAria={isDay ? "Predošlý deň" : "Predošlý týždeň"}
        nextAria={isDay ? "Ďalší deň" : "Ďalší týždeň"}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />

      {!isLoading && !isError && tallySlots.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <SlotTally
            counts={tallyCounts}
            label={isDay ? (isTodaySelected ? "Dnes" : undefined) : "Tento týždeň"}
            freeWord={isTodaySelected ? "ešte voľných" : "voľných"}
          />
          <SlotAvailByType
            counts={tallyAvail}
            label={isTodaySelected ? "Z toho ešte voľných" : "Z toho voľných"}
          />
        </div>
      )}

      {isLoading && <CalendarSkeleton />}
      {isError && (
        <EmptyState
          icon={AlertTriangle}
          title="Kalendár sa nepodarilo načítať"
          description={error instanceof Error ? error.message : "Skúste to znova."}
        />
      )}

      {!isLoading && !isError && isDay && (
        <div className="mx-auto mt-4 max-w-2xl">
          <DayColumn
            iso={selectedDay}
            highlightId={flashSlotId}
            day={dayByIso.get(selectedDay)}
            canManage={canManageDays}
            canManageClosures={canManageClosures}
            opening={pendingIso === selectedDay}
            onOpen={() => handleOpen(selectedDay)}
            onRequestDelete={() => setPendingDelete(selectedDay)}
            onRequestClose={() => setPendingClose(selectedDay)}
            onRequestReopen={() => setPendingReopen(selectedDay)}
            onSelect={handleSelect}
            stacked
          />
        </div>
      )}

      {!isLoading && !isError && !isDay && (
        <>
          {/* Desktop: working-day grid (Streda / Štvrtok / Piatok) */}
          <div className="mt-4 hidden gap-2 md:grid md:grid-cols-3">
            {weekIsos.map((iso) => (
              <DayColumn
                key={iso}
                iso={iso}
                highlightId={flashSlotId}
                day={dayByIso.get(iso)}
                canManage={canManageDays}
                canManageClosures={canManageClosures}
                opening={pendingIso === iso}
                onOpen={() => handleOpen(iso)}
                onRequestDelete={() => setPendingDelete(iso)}
                onRequestClose={() => setPendingClose(iso)}
                onRequestReopen={() => setPendingReopen(iso)}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Mobile: day chips + single day */}
          <div className="mt-4 md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {weekIsos.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(iso)}
                  aria-pressed={mobileDay === iso}
                  className={[
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium",
                    mobileDay === iso
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200",
                  ].join(" ")}
                >
                  {clinicDayChip(iso)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <DayColumn
                iso={mobileDay}
                highlightId={flashSlotId}
                day={dayByIso.get(mobileDay)}
                canManage={canManageDays}
                canManageClosures={canManageClosures}
                opening={pendingIso === mobileDay}
                onOpen={() => handleOpen(mobileDay)}
                onRequestDelete={() => setPendingDelete(mobileDay)}
                onRequestClose={() => setPendingClose(mobileDay)}
                onRequestReopen={() => setPendingReopen(mobileDay)}
                onSelect={handleSelect}
                stacked
              />
            </div>
          </div>
        </>
      )}

      {dialog?.type === "book" && (
        <BookingDialog
          slot={dialog.slot}
          dayIso={dialog.dayIso}
          isAdmin={isAdmin}
          onClose={close}
          onBooked={afterChange}
        />
      )}
      {dialog?.type === "actions" && (
        <AppointmentActions
          slot={dialog.slot}
          dayIso={dialog.dayIso}
          onClose={close}
          onChanged={invalidate}
        />
      )}
      {dialog?.type === "unlock" && (
        <SlotUnlockDialog
          slot={dialog.slot}
          dayIso={dialog.dayIso}
          onClose={close}
          onUnlocked={afterChange}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Zrušiť tento deň?"
          description={`Zruší sa ${clinicLongDate(pendingDelete)} vrátane jeho voľných slotov. Deň s objednávkami nemožno zrušiť.`}
          confirmLabel="Zrušiť deň"
          tone="danger"
          onConfirm={() => handleDelete(pendingDelete)}
          onClose={() =>
            pendingIso === pendingDelete ? undefined : setPendingDelete(null)
          }
        />
      )}

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
            handleOpen(pendingPassword, { password })
          }
          onClose={() => setPendingPassword(null)}
        />
      )}

      {pendingOverride && (
        <ConfirmDialog
          title="Otvoriť ďalšiu stredu?"
          description="V tomto mesiaci je už otvorená iná streda. Otvorenie ďalšej je výnimka a zaznamená sa do auditu."
          confirmLabel="Otvoriť stredu"
          requireReason
          reasonLabel="Dôvod výnimky"
          onConfirm={({ reason }) =>
            handleOpen(pendingOverride.iso, {
              password: pendingOverride.password,
              overrideReason: reason,
            })
          }
          onClose={() => setPendingOverride(null)}
        />
      )}

      {pendingClose && (
        <ConfirmDialog
          title="Zatvoriť tento deň?"
          description={`${clinicLongDate(pendingClose)} sa zablokuje — voľné sloty už nebude možné obsadiť. Existujúce objednávky zostanú zachované.`}
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
      <CalendarPrint period={mode} periodLabel={printLabel} groups={printGroups} />
    </>
  );
}

function Header({
  subtitle,
  badge,
  prevAria,
  nextAria,
  onPrev,
  onNext,
  onToday,
}: {
  subtitle: string;
  badge?: React.ReactNode;
  prevAria: string;
  nextAria: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarDays className="h-5 w-5 text-slate-400" />
          Kalendár ambulancie
          {badge}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToday}
          className="mr-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
        >
          Dnes
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label={prevAria}
          className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label={nextAria}
          className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-white"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// Clickable "23. týždeň" badge: opens a popover to jump to any ISO week of any
// year. `onPick` receives the Monday (ISO) that starts the chosen week.
function WeekPicker({
  weekStart,
  onPick,
}: {
  weekStart: string;
  onPick: (mondayIso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selYear = isoWeekYear(weekStart);
  const selWeek = isoWeekNumber(weekStart);
  const [year, setYear] = useState(selYear);

  // Opening the popover snaps the year navigation back to the current selection.
  function toggle() {
    if (!open) setYear(selYear);
    setOpen((o) => !o);
  }

  const weeks = isoWeeksInYear(year);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
      >
        {selWeek}. týždeň
        <ChevronDown className="h-3 w-3 text-slate-400" />
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
          <div className="absolute right-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:left-0 sm:right-auto">
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
            <div className="mt-2 grid grid-cols-7 gap-1">
              {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => {
                const isSel = year === selYear && w === selWeek;
                return (
                  <button
                    key={w}
                    type="button"
                    title={clinicLongDate(isoWeekStart(year, w))}
                    onClick={() => {
                      onPick(isoWeekStart(year, w));
                      setOpen(false);
                    }}
                    className={[
                      "rounded-md py-1 text-xs font-medium tabular-nums transition",
                      isSel
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {w}
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

function DayColumn({
  iso,
  day,
  canManage,
  canManageClosures,
  opening,
  onOpen,
  onRequestDelete,
  onRequestClose,
  onRequestReopen,
  onSelect,
  stacked,
  highlightId,
}: {
  iso: string;
  day: CalendarDayDTO | undefined;
  canManage: boolean;
  canManageClosures: boolean;
  opening: boolean;
  onOpen: () => void;
  onRequestDelete: () => void;
  onRequestClose: () => void;
  onRequestReopen: () => void;
  onSelect: (slot: SlotDTO, dayIso: string) => void;
  stacked?: boolean;
  highlightId?: string;
}) {
  const isWednesday = weekdayOf(iso) === 3;
  const isLastFriday = weekdayOf(iso) === 5 && isLastFridayOfMonth(dateOnly(iso));
  const isWorkingDay = WORKING_WEEKDAYS.includes(weekdayOf(iso));
  const isToday = iso === todayIso();
  const holiday = isWorkingDay ? holidayName(iso) : null;
  const canDelete = canManage && day?.dayType === "MANUAL_WEDNESDAY";
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
    <section
      className={`rounded-xl bg-white/60 ${isToday ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200"}`}
    >
      <header className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-white/90 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold capitalize text-slate-900">
            {clinicDayChip(iso)}
          </p>
          {isToday && (
            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Dnes
            </span>
          )}
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onRequestDelete}
            aria-label="Zrušiť deň"
            title="Zrušiť deň"
            className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {canClose && (
          <button
            type="button"
            onClick={onRequestClose}
            aria-label="Zatvoriť deň"
            title="Zatvoriť deň"
            className="rounded-md p-1 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
          >
            <Ban className="h-4 w-4" />
          </button>
        )}
        {canReopen && (
          <button
            type="button"
            onClick={onRequestReopen}
            aria-label="Znovu otvoriť deň"
            title="Znovu otvoriť deň"
            className="rounded-md p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </header>
      <div
        className={`space-y-1.5 p-2 ${stacked ? "" : "max-h-[70vh] overflow-y-auto"}`}
      >
        {day && day.slots.length > 0 ? (
          <>
            {day.status === "CLOSED" && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm font-medium text-amber-800">
                <Ban className="h-4 w-4 shrink-0" />
                <span>{holiday ? `Sviatok: ${holiday}` : (day.note ?? "Zatvorené")}</span>
              </div>
            )}
            {day.slots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                highlight={slot.id === highlightId}
                onSelect={(s) => onSelect(s, iso)}
              />
            ))}
          </>
        ) : !isWorkingDay ? (
          <div className="px-2 py-8 text-center">
            <p className="text-sm text-slate-300">Ambulancia nepracuje</p>
          </div>
        ) : (
          <div className="px-2 py-6 text-center">
            <p
              className={`text-sm ${holiday ? "font-medium text-amber-700" : "text-slate-400"}`}
            >
              {holiday
                ? `Sviatok: ${holiday}`
                : isWednesday
                  ? "Streda — zatvorená"
                  : isLastFriday
                    ? "Posledný piatok — zatvorený"
                    : "Zatiaľ negenerované"}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={onOpen}
                disabled={opening}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {opening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {holiday
                  ? "Otvoriť deň (sviatok)"
                  : isWednesday
                    ? "Otvoriť ambulanciu"
                    : isLastFriday
                      ? "Otvoriť posledný piatok"
                      : "Generovať deň"}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarSkeleton() {
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-3" aria-label="Načítavam kalendár" aria-busy="true">
      {[0, 1, 2].map((col) => (
        <div key={col} className="rounded-xl bg-white/60 p-2 ring-1 ring-slate-200">
          <Skeleton className="mb-2 h-6 w-24" />
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
