"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
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
import {
  AppointmentActions,
  type RescheduleOption,
} from "@/components/booking/AppointmentActions";
import { SlotUnlockDialog } from "@/components/booking/SlotUnlockDialog";
import {
  isoAddDays,
  startOfWeek,
  todayIso,
  clinicDayChip,
  clinicLongDate,
} from "@/lib/format";
import { weekdayOf, WORKING_WEEKDAYS, buildDayMap } from "@/lib/calendar-ui";
import { isLastFridayOfMonth, dateOnly } from "@/lib/calendar-date";

type Dialog =
  | { type: "book"; slot: SlotDTO; dayIso: string }
  | { type: "actions"; slot: SlotDTO; dayIso: string }
  | { type: "unlock"; slot: SlotDTO; dayIso: string }
  | null;

export function CalendarView({
  isAdmin,
  canManageDays,
  mode = "week",
  initialWeekStart,
  initialDay,
}: {
  isAdmin: boolean;
  canManageDays: boolean;
  mode?: "week" | "day";
  initialWeekStart?: string;
  initialDay?: string;
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

  const weekEnd = isoAddDays(weekStart, 6);
  const { data, isLoading, isError, error } = useCalendar(weekStart, weekEnd);
  const invalidate = useInvalidateCalendar();
  const { pendingIso, openDay, deleteDay, closeDay, reopenDay, requiresPassword } =
    useDayActions();

  const dayByIso = useMemo(() => buildDayMap(data?.days), [data]);

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

  // Available slots of a given type across the loaded week (reschedule targets).
  const rescheduleOptionsFor = (type: string): RescheduleOption[] => {
    const out: RescheduleOption[] = [];
    data?.days.forEach((day) =>
      day.slots.forEach((slot) => {
        if (slot.status === "AVAILABLE" && slot.appointmentType === type) {
          out.push({ slot, dayIso: day.date });
        }
      }),
    );
    return out;
  };

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
  async function handleClose(iso: string) {
    if ((await closeDay(iso)) === "ok") setPendingClose(null);
  }
  async function handleReopen(iso: string) {
    if ((await reopenDay(iso)) === "ok") setPendingReopen(null);
  }

  const close = () => setDialog(null);
  const afterChange = async () => {
    await invalidate();
    close();
  };

  // Day mode: one day, full focus, navigated day-by-day. weekStart stays in sync
  // so the fetched week always contains the selected day (and feeds reschedule).
  const isDay = mode === "day";
  function goToDay(iso: string) {
    setSelectedDay(iso);
    setWeekStart(startOfWeek(iso));
  }
  function handlePrev() {
    if (isDay) goToDay(isoAddDays(selectedDay, -1));
    else setWeekStart(isoAddDays(weekStart, -7));
  }
  function handleNext() {
    if (isDay) goToDay(isoAddDays(selectedDay, 1));
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

  return (
    <div>
      <Header
        subtitle={
          isDay
            ? clinicLongDate(selectedDay)
            : `${clinicLongDate(weekStart)} – ${clinicLongDate(weekEnd)}`
        }
        prevAria={isDay ? "Predošlý deň" : "Predošlý týždeň"}
        nextAria={isDay ? "Ďalší deň" : "Ďalší týždeň"}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />

      <Legend />

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
            day={dayByIso.get(selectedDay)}
            canManage={canManageDays}
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
                day={dayByIso.get(iso)}
                canManage={canManageDays}
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
                day={dayByIso.get(mobileDay)}
                canManage={canManageDays}
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
          rescheduleOptions={rescheduleOptionsFor(dialog.slot.appointmentType)}
          onClose={close}
          onChanged={afterChange}
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
              : "Otvoriť posledný piatok v mesiaci"
          }
          description="Tento deň je chránený. Zadajte heslo pre otvorenie."
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

function Header({
  subtitle,
  prevAria,
  nextAria,
  onPrev,
  onNext,
  onToday,
}: {
  subtitle: string;
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

function DayColumn({
  iso,
  day,
  canManage,
  opening,
  onOpen,
  onRequestDelete,
  onRequestClose,
  onRequestReopen,
  onSelect,
  stacked,
}: {
  iso: string;
  day: CalendarDayDTO | undefined;
  canManage: boolean;
  opening: boolean;
  onOpen: () => void;
  onRequestDelete: () => void;
  onRequestClose: () => void;
  onRequestReopen: () => void;
  onSelect: (slot: SlotDTO, dayIso: string) => void;
  stacked?: boolean;
}) {
  const isWednesday = weekdayOf(iso) === 3;
  const isLastFriday = weekdayOf(iso) === 5 && isLastFridayOfMonth(dateOnly(iso));
  const isWorkingDay = WORKING_WEEKDAYS.includes(weekdayOf(iso));
  const canDelete = canManage && day?.dayType === "MANUAL_WEDNESDAY";
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
  return (
    <section className="rounded-xl bg-white/60 ring-1 ring-slate-200">
      <header className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-white/90 px-3 py-2 backdrop-blur">
        <p className="text-sm font-semibold capitalize text-slate-900">
          {clinicDayChip(iso)}
        </p>
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
          day.slots.map((slot) => (
            <SlotCard key={slot.id} slot={slot} onSelect={(s) => onSelect(s, iso)} />
          ))
        ) : !isWorkingDay ? (
          <div className="px-2 py-8 text-center">
            <p className="text-sm text-slate-300">Ambulancia nepracuje</p>
          </div>
        ) : (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-slate-400">
              {isWednesday
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
                {isWednesday
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

function Legend() {
  const items = [
    { label: "Predhospitalizačné", color: "var(--slot-prehospital)", bd: "var(--slot-prehospital-bd)" },
    { label: "Porada", color: "var(--slot-blocked)", bd: "var(--slot-blocked-bd)" },
    { label: "Dispenzárne", color: "var(--slot-dispensary)", bd: "var(--slot-dispensary-bd)" },
    { label: "ECHO", color: "var(--slot-echo)", bd: "var(--slot-echo-bd)" },
    { label: "ECHO oddelenie", color: "var(--slot-echo-dept)", bd: "var(--slot-echo-dept-bd)" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded border"
            style={{ backgroundColor: it.color, borderColor: it.bd }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
