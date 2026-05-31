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
} from "lucide-react";
import type { CalendarDayDTO, SlotDTO } from "@/lib/api-types";
import { useCalendar, useInvalidateCalendar } from "@/hooks/useCalendar";
import { apiSend, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/Toast";
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

type Dialog =
  | { type: "book"; slot: SlotDTO; dayIso: string }
  | { type: "actions"; slot: SlotDTO; dayIso: string }
  | { type: "unlock"; slot: SlotDTO; dayIso: string }
  | null;

export function CalendarView({
  isAdmin,
  canManageDays,
  initialWeekStart,
  initialDay,
}: {
  isAdmin: boolean;
  canManageDays: boolean;
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
  const [opening, setOpening] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const weekEnd = isoAddDays(weekStart, 6);
  const { data, isLoading, isError, error } = useCalendar(weekStart, weekEnd);
  const invalidate = useInvalidateCalendar();
  const { toast } = useToast();

  const dayByIso = useMemo(() => buildDayMap(data?.days), [data]);

  const workingIsos = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => isoAddDays(weekStart, i)).filter((iso) =>
        WORKING_WEEKDAYS.includes(weekdayOf(iso)),
      ),
    [weekStart],
  );

  // Mobile shows one day; never default to a non-working day (e.g. today = Sunday).
  const mobileDay = workingIsos.includes(selectedDay) ? selectedDay : workingIsos[0];

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

  async function openOrGenerate(iso: string, overrideReason?: string) {
    const isWednesday = weekdayOf(iso) === 3;
    setOpening(iso);
    try {
      await apiSend(
        `/api/calendar-days/${iso}/${isWednesday ? "open" : "generate"}`,
        "POST",
        overrideReason ? { overrideReason } : {},
      );
      await invalidate();
      setPendingOverride(null);
    } catch (e) {
      // Another Wednesday is already open this month → offer an audited override.
      if (e instanceof ApiError && e.code === "CONFLICT" && isWednesday && !overrideReason) {
        setPendingOverride(iso);
      } else {
        toast(e instanceof Error ? e.message : "Operácia zlyhala", "error");
      }
    } finally {
      setOpening(null);
    }
  }

  async function deleteDay(iso: string) {
    setDeleting(true);
    try {
      await apiSend(`/api/calendar-days/${iso}`, "DELETE");
      await invalidate();
      setPendingDelete(null);
      toast("Deň zrušený", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Zrušenie zlyhalo", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function closeDay(iso: string) {
    setClosing(true);
    try {
      await apiSend(`/api/calendar-days/${iso}/close`, "POST", { force: true });
      await invalidate();
      setPendingClose(null);
      toast("Deň zatvorený", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Zatvorenie zlyhalo", "error");
    } finally {
      setClosing(false);
    }
  }

  const close = () => setDialog(null);
  const afterChange = async () => {
    await invalidate();
    close();
  };

  return (
    <div>
      <Header
        weekStart={weekStart}
        weekEnd={weekEnd}
        onPrev={() => setWeekStart(isoAddDays(weekStart, -7))}
        onNext={() => setWeekStart(isoAddDays(weekStart, 7))}
        onToday={() => {
          setWeekStart(startOfWeek(todayIso()));
          setSelectedDay(todayIso());
        }}
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

      {!isLoading && !isError && (
        <>
          {/* Desktop: week grid */}
          <div className="mt-4 hidden gap-3 md:grid md:grid-cols-3">
            {workingIsos.map((iso) => (
              <DayColumn
                key={iso}
                iso={iso}
                day={dayByIso.get(iso)}
                canManage={canManageDays}
                opening={opening === iso}
                onOpen={() => openOrGenerate(iso)}
                onRequestDelete={() => setPendingDelete(iso)}
                onRequestClose={() => setPendingClose(iso)}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Mobile: day chips + single day */}
          <div className="mt-4 md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {workingIsos.map((iso) => (
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
                opening={opening === mobileDay}
                onOpen={() => openOrGenerate(mobileDay)}
                onRequestDelete={() => setPendingDelete(mobileDay)}
                onRequestClose={() => setPendingClose(mobileDay)}
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
          onConfirm={() => deleteDay(pendingDelete)}
          onClose={() => (deleting ? undefined : setPendingDelete(null))}
        />
      )}

      {pendingOverride && (
        <ConfirmDialog
          title="Otvoriť ďalšiu stredu?"
          description="V tomto mesiaci je už otvorená iná streda. Otvorenie ďalšej je výnimka a zaznamená sa do auditu."
          confirmLabel="Otvoriť stredu"
          requireReason
          reasonLabel="Dôvod výnimky"
          onConfirm={(reason) => openOrGenerate(pendingOverride, reason)}
          onClose={() => setPendingOverride(null)}
        />
      )}

      {pendingClose && (
        <ConfirmDialog
          title="Zatvoriť tento deň?"
          description={`${clinicLongDate(pendingClose)} sa zablokuje — voľné sloty už nebude možné obsadiť. Existujúce objednávky zostanú zachované.`}
          confirmLabel="Zatvoriť deň"
          tone="danger"
          onConfirm={() => closeDay(pendingClose)}
          onClose={() => (closing ? undefined : setPendingClose(null))}
        />
      )}
    </div>
  );
}

function Header({
  weekStart,
  weekEnd,
  onPrev,
  onNext,
  onToday,
}: {
  weekStart: string;
  weekEnd: string;
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
        <p className="mt-0.5 text-sm text-slate-500">
          {clinicLongDate(weekStart)} – {clinicLongDate(weekEnd)}
        </p>
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
          aria-label="Predošlý týždeň"
          className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Ďalší týždeň"
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
  onSelect: (slot: SlotDTO, dayIso: string) => void;
  stacked?: boolean;
}) {
  const isWednesday = weekdayOf(iso) === 3;
  const canDelete = canManage && day?.dayType === "MANUAL_WEDNESDAY";
  const canClose =
    canManage &&
    !!day &&
    day.dayType !== "MANUAL_WEDNESDAY" &&
    day.status !== "CLOSED";
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
      </header>
      <div
        className={`space-y-1.5 p-2 ${stacked ? "" : "max-h-[70vh] overflow-y-auto"}`}
      >
        {day && day.slots.length > 0 ? (
          day.slots.map((slot) => (
            <SlotCard key={slot.id} slot={slot} onSelect={(s) => onSelect(s, iso)} />
          ))
        ) : (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-slate-400">
              {isWednesday ? "Streda — zatvorená" : "Zatiaľ negenerované"}
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
                {isWednesday ? "Otvoriť ambulanciu" : "Generovať deň"}
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
    <div className="mt-4 grid gap-3 md:grid-cols-3" aria-label="Načítavam kalendár" aria-busy="true">
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
    { label: "Poradňa", color: "var(--slot-blocked)", bd: "var(--slot-blocked-bd)" },
    { label: "Dispenzárne", color: "var(--slot-dispensary)", bd: "var(--slot-dispensary-bd)" },
    { label: "ECHO", color: "var(--slot-echo)", bd: "var(--slot-echo-bd)" },
    { label: "Akútna rezerva", color: "var(--slot-reserve)", bd: "var(--slot-reserve-bd)" },
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
