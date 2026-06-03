"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { apiGet } from "@/lib/client";
import {
  addMonths,
  CLINIC_MONTHS_SHORT,
  clinicMonthLabel,
  clinicTime,
  dayOfMonth,
  isoAddDays,
  monthOf,
  startOfMonth,
  startOfWeek,
  todayIso,
} from "@/lib/format";

export interface PickableSlot {
  id: string;
  startAt: string;
  endAt: string;
  appointmentType: string;
  date: string;
}

const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

export function SlotPickerCalendar({
  type,
  typeLabel,
  onPick,
  onClose,
}: {
  type: "DISPENSARY" | "ECHO" | "PRE_HOSPITAL";
  typeLabel: string;
  onPick: (slot: PickableSlot) => void;
  onClose: () => void;
}) {
  const today = todayIso();
  const minMonth = monthOf(today);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(month.slice(0, 4)));

  const minYear = Number(minMonth.slice(0, 4));

  // The visible grid is a Monday-aligned 6-week block, so it spills into the
  // neighbouring months — fetch availability for the whole block.
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = isoAddDays(gridStart, 41);

  const { data, isLoading } = useQuery({
    queryKey: ["slots-available", type, gridStart],
    queryFn: () =>
      apiGet<{ slots: PickableSlot[] }>(
        `/api/slots/available?type=${type}&from=${gridStart}&to=${gridEnd}`,
      ),
  });

  const slotsByDay = useMemo(() => {
    const map = new Map<string, PickableSlot[]>();
    for (const slot of data?.slots ?? []) {
      const list = map.get(slot.date);
      if (list) list.push(slot);
      else map.set(slot.date, [slot]);
    }
    return map;
  }, [data]);

  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => isoAddDays(gridStart, i)),
    [gridStart],
  );

  const selectedSlots = selectedDay ? slotsByDay.get(selectedDay) ?? [] : [];

  function changeMonth(delta: number) {
    setSelectedDay(null);
    setMonth((m) => addMonths(m, delta));
  }

  function openPicker() {
    setPickerYear(Number(month.slice(0, 4)));
    setPickerOpen(true);
  }

  function pickMonth(monthIdx: number) {
    setSelectedDay(null);
    setMonth(`${pickerYear}-${String(monthIdx + 1).padStart(2, "0")}-01`);
    setPickerOpen(false);
  }

  return (
    <Modal
      title="Vybrať termín"
      subtitle={typeLabel}
      onClose={onClose}
    >
      <div className="space-y-3">
        {!pickerOpen && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              disabled={monthOf(month) <= minMonth}
              aria-label="Predchádzajúci mesiac"
              className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={openPicker}
              aria-label="Vybrať mesiac a rok"
              className="rounded-lg px-2 py-1 text-sm font-semibold capitalize text-slate-900 transition hover:bg-slate-50"
            >
              {clinicMonthLabel(month)}
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Nasledujúci mesiac"
              className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {pickerOpen && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPickerYear((y) => y - 1)}
                disabled={pickerYear <= minYear}
                aria-label="Predchádzajúci rok"
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-slate-900">{pickerYear}</span>
              <button
                type="button"
                onClick={() => setPickerYear((y) => y + 1)}
                aria-label="Nasledujúci rok"
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {CLINIC_MONTHS_SHORT.map((label, idx) => {
                const ym = `${pickerYear}-${String(idx + 1).padStart(2, "0")}`;
                const disabled = ym < minMonth;
                const isCurrent = ym === monthOf(month);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickMonth(idx)}
                    className={`rounded-lg py-2 text-sm capitalize transition ${
                      isCurrent
                        ? "bg-slate-900 font-semibold text-white"
                        : disabled
                          ? "text-slate-300"
                          : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={`relative ${pickerOpen ? "hidden" : ""}`}>
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-[11px] font-semibold uppercase text-slate-400"
              >
                {w}
              </div>
            ))}
            {days.map((iso) => {
              const inMonth = monthOf(iso) === monthOf(month);
              const count = slotsByDay.get(iso)?.length ?? 0;
              const available = inMonth && iso > today && count > 0;
              const isSelected = iso === selectedDay;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!available}
                  onClick={() => setSelectedDay(iso)}
                  className={`relative aspect-square rounded-lg text-sm transition ${
                    isSelected
                      ? "bg-slate-900 font-semibold text-white"
                      : available
                        ? "bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                        : inMonth
                          ? "text-slate-300"
                          : "text-slate-200"
                  }`}
                >
                  {dayOfMonth(iso)}
                  {available && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {!pickerOpen && selectedDay && (
          <div className="border-t border-slate-100 pt-3">
            {selectedSlots.length === 0 ? (
              <p className="text-sm text-slate-400">Žiadny voľný termín v tento deň.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {selectedSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onPick(slot)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono tabular-nums text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                  >
                    {clinicTime(slot.startAt)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!pickerOpen && !selectedDay && !isLoading && (
          <p className="text-center text-xs text-slate-400">
            Vyberte zvýraznený deň a potom konkrétny čas.
          </p>
        )}
      </div>
    </Modal>
  );
}
