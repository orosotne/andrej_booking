"use client";

import { useState } from "react";
import {
  CalendarOff,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Lock,
  LockOpen,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/client";
import {
  clinicShortDate,
  clinicLongDate,
  clinicDate,
  clinicTime,
  todayIso,
} from "@/lib/format";
import { TYPE_META } from "@/lib/slot-style";
import type {
  VacationDTO,
  ClosedDayDTO,
  LockedSlotDTO,
  CalendarResponse,
} from "@/lib/api-types";

// The list only carries genuine closures (rule-based default-closed days are
// filtered out server-side), so the reason is either the holiday or a manual close.
function closedDayReason(d: ClosedDayDTO): string {
  if (d.holiday) return `Sviatok: ${d.holiday}`;
  return d.note ?? "Zatvorené ručne";
}

const CURRENT_YEAR = Number(todayIso().slice(0, 4));

export function VacationsManager() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vacations", year],
    queryFn: () => apiGet<{ vacations: VacationDTO[] }>(`/api/vacations?year=${year}`),
  });
  const vacations = data?.vacations ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["vacations"] });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarOff className="h-5 w-5 text-slate-400" />
            Dovolenky, zatvorené dni a sloty
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Naplánované dovolenky, jednotlivo zatvorené dni aj ručne zamknuté sloty
            ambulancie. Dovolenku nemožno naplánovať na deň s objednaným pacientom —
            najprv ho presuňte inde.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            aria-label="Predošlý rok"
          >
            ‹
          </button>
          <span className="px-2 text-sm font-semibold tabular-nums text-slate-900">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            aria-label="Ďalší rok"
          >
            ›
          </button>
        </div>
      </header>

      <AddVacation onSaved={refresh} />

      <div>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : vacations.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="Žiadne dovolenky"
            description={`V roku ${year} nie je naplánovaná žiadna dovolenka.`}
          />
        ) : (
          <ul className="space-y-2">
            {vacations.map((v) => (
              <VacationRow key={v.id} vacation={v} onChanged={refresh} />
            ))}
          </ul>
        )}
      </div>

      <ClosedDaysManager year={year} />

      <LockedSlotsManager year={year} />
    </div>
  );
}

function ClosedDaysManager({ year }: { year: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [lockDate, setLockDate] = useState("");
  const [lockReason, setLockReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["closed-days", year],
    queryFn: () =>
      apiGet<{ days: ClosedDayDTO[] }>(`/api/calendar-days/closed?year=${year}`),
  });
  const days = data?.days ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["closed-days"] });

  async function unlock(date: string) {
    if (!password) {
      setError("Zadajte heslo na odomknutie.");
      return;
    }
    setError(null);
    setBusy(date);
    try {
      await apiSend(`/api/calendar-days/${date}/reopen`, "POST", { password });
      toast("Deň odomknutý", "success");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(null);
    }
  }

  async function lock(e: React.FormEvent) {
    e.preventDefault();
    if (!lockDate) return;
    if (!password) {
      setError("Zadajte heslo na zamknutie.");
      return;
    }
    setError(null);
    setBusy("lock");
    try {
      await apiSend(`/api/calendar-days/${lockDate}/close`, "POST", {
        password,
        reason: lockReason.trim() || undefined,
      });
      toast("Deň zamknutý", "success");
      setLockDate("");
      setLockReason("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Lock className="h-4 w-4 text-slate-400" />
          Administratívne zatvorené dni
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Jednotlivo zamknuté dni a zatvorené sviatky (mimo dovoleniek). Zamykanie
          aj odomykanie je chránené rovnakým heslom ako v kalendári.
        </p>
      </div>

      <Field
        label="Heslo"
        type="password"
        autoComplete="off"
        placeholder="Heslo na zamknutie/odomknutie dňa"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <form
        onSubmit={lock}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      >
        <div className="min-w-[10rem] flex-1">
          <Field
            label="Zamknúť deň"
            type="date"
            value={lockDate}
            onChange={(e) => setLockDate(e.target.value)}
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <Field
            label="Dôvod (voliteľné)"
            value={lockReason}
            onChange={(e) => setLockReason(e.target.value)}
            placeholder="napr. školenie"
          />
        </div>
        <Button
          type="submit"
          loading={busy === "lock"}
          disabled={!lockDate}
        >
          <Lock className="h-4 w-4" />
          Zamknúť
        </Button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : days.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="Žiadne zatvorené dni"
          description={`V roku ${year} nie je administratívne zatvorený žiadny deň.`}
        />
      ) : (
        <ul className="space-y-2">
          {days.map((d) => (
            <li
              key={d.date}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900 first-letter:uppercase">
                  {clinicLongDate(d.date)}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {closedDayReason(d)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unlock(d.date)}
                disabled={busy === d.date}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
              >
                {busy === d.date ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LockOpen className="h-4 w-4" />
                )}
                Odomknúť
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LockedSlotsManager({ year }: { year: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [pickDate, setPickDate] = useState("");
  const [lockReason, setLockReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["locked-slots", year],
    queryFn: () =>
      apiGet<{ slots: LockedSlotDTO[] }>(`/api/slots/locked?year=${year}`),
  });
  const slots = data?.slots ?? [];

  // Slots of the picked day, so the admin can lock a specific one from here.
  const { data: dayData, isFetching: dayLoading } = useQuery({
    queryKey: ["day-slots", pickDate],
    queryFn: () =>
      apiGet<CalendarResponse>(
        `/api/calendar?from=${encodeURIComponent(pickDate)}&to=${encodeURIComponent(pickDate)}`,
      ),
    enabled: !!pickDate,
  });
  const lockable = (dayData?.days[0]?.slots ?? []).filter(
    (s) => s.status === "AVAILABLE",
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["locked-slots"] });
    qc.invalidateQueries({ queryKey: ["day-slots"] });
  };

  async function unlock(id: string) {
    if (!password) {
      setError("Zadajte heslo na odomknutie slotu.");
      return;
    }
    setError(null);
    setBusy(id);
    try {
      await apiSend(`/api/slots/${id}/unlock`, "POST", { password });
      toast("Slot odomknutý", "success");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(null);
    }
  }

  async function lock(id: string) {
    if (!password) {
      setError("Zadajte heslo na zamknutie slotu.");
      return;
    }
    setError(null);
    setBusy(id);
    try {
      await apiSend(`/api/slots/${id}/lock`, "POST", {
        password,
        reason: lockReason.trim() || undefined,
      });
      toast("Slot zamknutý", "success");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Lock className="h-4 w-4 text-slate-400" />
          Ručne zamknuté sloty
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Jednotlivé sloty zamknuté ručne (na ochranu kapacity). Sloty zamknuté
          automaticky pravidlami sa tu nezobrazujú. Zamykanie aj odomykanie je
          chránené rovnakým heslom ako v kalendári.
        </p>
      </div>

      <Field
        label="Heslo"
        type="password"
        autoComplete="off"
        placeholder="Heslo na zamknutie/odomknutie slotu"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field
              label="Vybrať deň"
              type="date"
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Field
              label="Dôvod (voliteľné)"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="napr. blokujem kapacitu"
            />
          </div>
        </div>

        {pickDate &&
          (dayLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : lockable.length === 0 ? (
            <p className="text-sm text-slate-500">
              V tento deň nie je žiadny voľný slot na zamknutie.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-sm text-slate-500">
                Kliknutím zamknete vybraný slot:
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {lockable.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => lock(s.id)}
                    disabled={busy === s.id}
                    className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                  >
                    {busy === s.id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {clinicTime(s.startAt)} · {TYPE_META[s.appointmentType].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="Žiadne zamknuté sloty"
          description={`V roku ${year} nie je ručne zamknutý žiadny slot.`}
        />
      ) : (
        <ul className="space-y-2">
          {slots.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900 first-letter:uppercase">
                  {clinicLongDate(clinicDate(s.startAt))}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {clinicTime(s.startAt)}–{clinicTime(s.endAt)} ·{" "}
                  {TYPE_META[s.appointmentType].label}
                  {s.lockedReason ? ` · ${s.lockedReason}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unlock(s.id)}
                disabled={busy === s.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
              >
                {busy === s.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LockOpen className="h-4 w-4" />
                )}
                Odomknúť
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddVacation({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = !from || !to || from > to;

  function reset() {
    setFrom("");
    setTo("");
    setReason("");
    setError(null);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    setBusy(true);
    try {
      await apiSend("/api/vacations", "POST", {
        from,
        to,
        reason: reason.trim() || undefined,
      });
      toast("Dovolenka naplánovaná", "success");
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        <Plus className="h-4 w-4" />
        Pridať dovolenku
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Od"
          type="date"
          required
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="Do"
          type="date"
          required
          min={from || undefined}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <TextareaField
        label="Dôvod (voliteľné)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="napr. dovolenka, školenie"
      />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" fullWidth onClick={reset}>
          Zrušiť
        </Button>
        <Button type="submit" fullWidth loading={busy} disabled={invalid}>
          <CalendarOff className="h-4 w-4" />
          Naplánovať dovolenku
        </Button>
      </div>
    </form>
  );
}

function VacationRow({
  vacation,
  onChanged,
}: {
  vacation: VacationDTO;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [from, setFrom] = useState(vacation.from);
  const [to, setTo] = useState(vacation.to);
  const [reason, setReason] = useState(vacation.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = !from || !to || from > to;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    setBusy(true);
    try {
      await apiSend(`/api/vacations/${vacation.id}`, "PATCH", {
        from,
        to,
        reason: reason.trim() || undefined,
      });
      toast("Dovolenka upravená", "success");
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await apiSend(`/api/vacations/${vacation.id}`, "DELETE");
      toast("Dovolenka odobratá", "success");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-slate-200 bg-white p-4">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Od"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Field
              label="Do"
              type="date"
              required
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <TextareaField
            label="Dôvod (voliteľné)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => {
                setEditing(false);
                setError(null);
                setFrom(vacation.from);
                setTo(vacation.to);
                setReason(vacation.reason ?? "");
              }}
            >
              Zrušiť
            </Button>
            <Button type="submit" fullWidth loading={busy} disabled={invalid}>
              Uložiť zmeny
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {clinicShortDate(vacation.from)}
            {vacation.to !== vacation.from && ` – ${clinicShortDate(vacation.to)}`}
          </p>
          {vacation.reason && (
            <p className="mt-0.5 text-sm text-slate-500">{vacation.reason}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Upraviť dovolenku"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Odobrať dovolenku"
            className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm">
          <span className="text-red-700">Odobrať dovolenku a znova otvoriť dni?</span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="rounded-md px-2 py-1 text-slate-600 hover:bg-white"
            >
              Zrušiť
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Áno, odobrať
            </button>
          </span>
        </div>
      )}
    </li>
  );
}
