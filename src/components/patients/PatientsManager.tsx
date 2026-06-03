"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserPlus, Users, Loader2, Pencil, CalendarSearch } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { SlotPickerCalendar } from "./SlotPickerCalendar";
import {
  clinicTime,
  clinicLongDate,
  clinicDayChip,
  clinicShortDate,
} from "@/lib/format";
import type {
  AppointmentTypeLit,
  PatientCategoryLit,
} from "@/lib/slot-engine/types";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  nationalId: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  externalPatientId: string | null;
  note: string | null;
  // YYYY-MM-DD of the nearest upcoming scheduled appointment, or null if none.
  nextAppointmentDate: string | null;
}

type Editing = Patient | "new" | null;

export function PatientsManager() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const r = await apiGet<{ patients: Patient[] }>(
          `/api/patients?search=${encodeURIComponent(q)}`,
        );
        setPatients(r.patients);
      } catch (e) {
        // Without this the empty list would masquerade as "no patients found".
        toast(
          e instanceof Error ? e.message : "Načítanie pacientov zlyhalo",
          "error",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const timer = setTimeout(() => load(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query, load]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Pacienti</h1>
        <Button size="sm" onClick={() => setEditing("new")}>
          <UserPlus className="h-4 w-4" />
          Nový pacient
        </Button>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Hľadať pacienta"
          placeholder="Hľadať podľa mena, priezviska, telefónu…"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-slate-400" />
        )}
      </div>

      {!loading && patients.length === 0 ? (
        <div className="mt-3 rounded-xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={Users}
            title="Žiadni pacienti"
            description={query ? "Skúste iné hľadanie." : "Pridajte prvého pacienta."}
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {patients.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {p.lastName} {p.firstName}
                  </span>
                  {p.phone && (
                    <span className="block text-sm text-slate-400">{p.phone}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {p.nextAppointmentDate ? (
                    <span className="text-emerald-700">
                      {clinicShortDate(p.nextAppointmentDate)}
                    </span>
                  ) : (
                    <span className="text-slate-900">Neobjednaný</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PatientDialog
          patient={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load(query.trim());
          }}
        />
      )}
    </div>
  );
}

function PatientDialog({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { busy, run } = useAsyncAction();
  // For an existing patient, identity fields (name, surname, birth year, phone)
  // start read-only behind an explicit "Upraviť" toggle to prevent accidental edits.
  const [editingIdentity, setEditingIdentity] = useState(false);
  const locked = patient !== null && !editingIdentity;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    firstName: patient?.firstName ?? "",
    lastName: patient?.lastName ?? "",
    birthYear: patient?.birthYear ? String(patient.birthYear) : "",
    nationalId: patient?.nationalId ?? "",
    phone: patient?.phone ?? "",
    note: patient?.note ?? "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    // Editing only sends the still-mutable fields; creation sends the full identity.
    if (patient) {
      run(
        () =>
          apiSend(`/api/patients/${patient.id}`, "PATCH", {
            ...(editingIdentity && {
              firstName: form.firstName,
              lastName: form.lastName,
              birthYear: Number(form.birthYear),
              phone: form.phone,
            }),
            nationalId: form.nationalId || undefined,
            note: form.note,
          }),
        { success: "Pacient upravený", onDone: onSaved },
      );
      return;
    }
    run(
      () =>
        apiSend("/api/patients", "POST", {
          firstName: form.firstName,
          lastName: form.lastName,
          birthYear: Number(form.birthYear),
          nationalId: form.nationalId || undefined,
          phone: form.phone,
          note: form.note || undefined,
        }),
      { success: "Pacient vytvorený", onDone: onSaved },
    );
  }

  function handleDelete() {
    if (!patient) return;
    setConfirmDelete(false);
    run(() => apiSend(`/api/patients/${patient.id}`, "DELETE"), {
      success: "Pacient zmazaný",
      onDone: onSaved,
    });
  }

  return (
    <Modal title={patient ? "Detail o pacientovi" : "Nový pacient"} onClose={onClose}>
      {patient && <PatientAppointment patientId={patient.id} />}
      <form onSubmit={save} className="space-y-3">
        {patient && locked && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">
              Identifikačné údaje sú zamknuté proti náhodnej zmene.
            </p>
            <button
              type="button"
              onClick={() => setEditingIdentity(true)}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
            >
              <Pencil className="h-3.5 w-3.5" />
              Upraviť
            </button>
          </div>
        )}
        {patient && editingIdentity && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Úprava identifikačných údajov je odomknutá.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Meno"
            required
            disabled={locked}
            className="disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
          />
          <Field
            label="Priezvisko"
            required
            disabled={locked}
            className="disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Rok narodenia"
            required
            type="number"
            inputMode="numeric"
            min={1900}
            max={new Date().getFullYear()}
            placeholder="napr. 1985"
            disabled={locked}
            className="disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            value={form.birthYear}
            onChange={(e) => set("birthYear", e.target.value)}
          />
          <Field
            label="Rodné číslo"
            hint="nepovinné"
            inputMode="numeric"
            value={form.nationalId}
            onChange={(e) => set("nationalId", e.target.value)}
          />
        </div>
        <Field
          label="Telefónne číslo"
          required
          inputMode="tel"
          disabled={locked}
          className="disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        <TextareaField
          label="Poznámka"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
        />
        <Button
          type="submit"
          fullWidth
          loading={busy}
          disabled={!form.firstName || !form.lastName || !form.birthYear || !form.phone}
        >
          Uložiť
        </Button>

        {patient &&
          (confirmDelete ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm">
              <span className="text-red-700">Naozaj zmazať pacienta?</span>
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
                  onClick={handleDelete}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Áno, zmazať
                </button>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Zmazať pacienta
            </button>
          ))}
      </form>
    </Modal>
  );
}

// Quick-book picker lives only in the patient detail. The three bookable types
// each map to the patient category that the booking service accepts for that
// slot type (see categoryAllowsSlot).
const BOOK_TYPES: ReadonlyArray<{
  type: Extract<AppointmentTypeLit, "DISPENSARY" | "ECHO" | "PRE_HOSPITAL">;
  label: string;
  category: PatientCategoryLit;
}> = [
  { type: "DISPENSARY", label: "Dispenzárne", category: "DISPENZAR" },
  { type: "ECHO", label: "ECHO", category: "ECHO" },
  { type: "PRE_HOSPITAL", label: "Akútne", category: "AKUTNE" },
];

const HORIZONS: ReadonlyArray<{
  months: number;
  maxMonths?: number;
  label: string;
}> = [
  { months: 0, maxMonths: 1, label: "do 1 mes." },
  { months: 3, label: "o 3 mes." },
  { months: 6, label: "o 6 mes." },
  { months: 11, label: "o 11 mes." },
];

type BookType = (typeof BOOK_TYPES)[number]["type"];

// Monday-based week start (clinic weeks run Mon–Sun) as a millisecond key.
function weekStartMs(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// If the candidate date collides with an existing appointment at the tightest
// granularity (day → week → month), describe it; otherwise null (no warning).
function bookingConflict(
  candidateDate: string,
  existing: UpcomingDTO[],
): { scope: "deň" | "týždeň" | "mesiac"; dates: string[] } | null {
  const sameDay = existing.filter((a) => a.date === candidateDate);
  if (sameDay.length)
    return { scope: "deň", dates: sameDay.map((a) => a.date) };
  const cw = weekStartMs(candidateDate);
  const sameWeek = existing.filter((a) => weekStartMs(a.date) === cw);
  if (sameWeek.length)
    return { scope: "týždeň", dates: sameWeek.map((a) => a.date) };
  const cm = candidateDate.slice(0, 7);
  const sameMonth = existing.filter((a) => a.date.slice(0, 7) === cm);
  if (sameMonth.length)
    return { scope: "mesiac", dates: sameMonth.map((a) => a.date) };
  return null;
}

interface UpcomingDTO {
  id: string;
  startAt: string;
  endAt: string;
  appointmentType: string;
  date: string;
}

interface LastVisitDTO {
  date: string;
  appointmentType: string;
}

interface NextSlot {
  id: string;
  startAt: string;
  endAt: string;
  appointmentType: string;
  date: string;
}

function PatientAppointment({ patientId }: { patientId: string }) {
  const { busy, run } = useAsyncAction();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<BookType>("DISPENSARY");
  const [lookup, setLookup] = useState<{
    months: number;
    maxMonths?: number;
    slot: NextSlot | null;
  } | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Holds a candidate awaiting confirmation when it collides with an existing
  // appointment in the same day/week/month — booking is allowed, just warned.
  const [pendingBook, setPendingBook] = useState<{
    slot: NextSlot;
    category: PatientCategoryLit;
    scope: "deň" | "týždeň" | "mesiac";
    dates: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["patient-upcoming", patientId],
    queryFn: () =>
      apiGet<{ upcomingList: UpcomingDTO[]; lastVisit: LastVisitDTO | null }>(
        `/api/patients/${patientId}`,
      ),
  });
  const upcomingList = data?.upcomingList ?? [];
  const lastVisit = data?.lastVisit ?? null;

  async function lookupSlot(h: { months: number; maxMonths?: number }) {
    setLookupBusy(true);
    setLookup(null);
    setPendingBook(null);
    try {
      const r = await apiGet<{ slot: NextSlot | null }>(
        `/api/slots/next?type=${type}&months=${h.months}${
          h.maxMonths !== undefined ? `&maxMonths=${h.maxMonths}` : ""
        }`,
      );
      setLookup({ months: h.months, maxMonths: h.maxMonths, slot: r.slot });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Hľadanie termínu zlyhalo", "error");
    } finally {
      setLookupBusy(false);
    }
  }

  function doBook(slot: NextSlot, category: PatientCategoryLit) {
    run(
      () =>
        apiSend(`/api/slots/${slot.id}/book`, "POST", {
          patientId,
          appointmentType: slot.appointmentType,
          patientCategory: category,
        }),
      {
        success: "Pacient objednaný",
        onDone: () => {
          setLookup(null);
          setPendingBook(null);
          qc.invalidateQueries({ queryKey: ["patient-upcoming", patientId] });
          qc.invalidateQueries({ queryKey: ["calendar"] });
        },
      },
    );
  }

  // Warn (but don't block) when the patient already has a termín in the same
  // day/week/month as the candidate; confirmation proceeds with the booking.
  function book(slot: NextSlot, category: PatientCategoryLit) {
    const conflict = bookingConflict(slot.date, upcomingList);
    if (conflict) {
      setPendingBook({ slot, category, ...conflict });
      return;
    }
    doBook(slot, category);
  }

  function cancelTermin(id: string, reason: string) {
    run(() => apiSend(`/api/appointments/${id}/cancel`, "POST", { reason }), {
      success: "Termín zrušený",
      onDone: () => {
        qc.invalidateQueries({ queryKey: ["patient-upcoming", patientId] });
        qc.invalidateQueries({ queryKey: ["calendar"] });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Načítavam termín…
      </div>
    );
  }

  // Shown in every state (booked or not) above the rest of the panel.
  const lastVisitLine = (
    <p className="mb-2 text-xs text-slate-500">
      <span className="font-semibold uppercase tracking-wide text-slate-400">
        Naposledy vyšetrený:
      </span>{" "}
      {lastVisit ? (
        <span className="text-slate-700">
          {clinicShortDate(lastVisit.date)} ·{" "}
          {TYPE_META[lastVisit.appointmentType as AppointmentTypeLit]?.label ??
            lastVisit.appointmentType}
        </span>
      ) : (
        <span className="italic text-slate-400">zatiaľ bez návštevy</span>
      )}
    </p>
  );

  const category = BOOK_TYPES.find((t) => t.type === type)?.category ?? "AKUTNE";
  const candidate = lookup && !lookupBusy ? lookup.slot : null;
  const noneFound = lookup !== null && !lookupBusy && lookup.slot === null;

  return (
    <>
      {lastVisitLine}

      {upcomingList.map((appt) => (
        <UpcomingTermin
          key={appt.id}
          appt={appt}
          busy={busy}
          onCancel={(reason) => cancelTermin(appt.id, reason)}
        />
      ))}

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {upcomingList.length > 0
            ? "Pridať ďalší termín"
            : "Nie je objednaný — rýchle objednanie"}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {BOOK_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => {
                setType(t.type);
                setLookup(null);
                setPendingBook(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                type === t.type
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {HORIZONS.map((h) => (
            <button
              key={h.months}
              type="button"
              disabled={lookupBusy || busy}
              onClick={() => lookupSlot(h)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                lookup?.months === h.months
                  ? "border-slate-900 bg-slate-50 text-slate-900"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={lookupBusy || busy}
          onClick={() => setPickerOpen(true)}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:opacity-50"
        >
          <CalendarSearch className="h-3.5 w-3.5" />
          Vybrať termín z kalendára
        </button>

        {lookupBusy && (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hľadám termín…
          </div>
        )}

        {candidate && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm">
              <span className="font-medium text-slate-900">
                {clinicDayChip(candidate.date)}
              </span>{" "}
              <span className="font-mono tabular-nums text-slate-600">
                {clinicTime(candidate.startAt)}
              </span>
            </span>
            <Button size="sm" loading={busy} onClick={() => book(candidate, category)}>
              Objednať
            </Button>
          </div>
        )}

        {pendingBook && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-sm font-medium text-amber-800">
              Pacient už má termín v rovnaký {pendingBook.scope}:
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-amber-700">
              {pendingBook.dates.map((d) => (
                <li key={d}>{clinicLongDate(d)}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-700">
              Naozaj objednať ďalší termín na {clinicDayChip(pendingBook.slot.date)}{" "}
              {clinicTime(pendingBook.slot.startAt)}?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                fullWidth
                disabled={busy}
                onClick={() => setPendingBook(null)}
              >
                Späť
              </Button>
              <Button
                size="sm"
                fullWidth
                loading={busy}
                onClick={() => doBook(pendingBook.slot, pendingBook.category)}
              >
                Objednať aj tak
              </Button>
            </div>
          </div>
        )}

        {noneFound && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {lookup?.maxMonths !== undefined
              ? "Žiadny voľný termín do mesiaca."
              : "Pre tento výber nie je žiadny voľný termín."}
          </p>
        )}
      </div>

      {pickerOpen && (
        <SlotPickerCalendar
          type={type}
          typeLabel={BOOK_TYPES.find((t) => t.type === type)?.label ?? ""}
          onPick={(slot) => {
            setPickerOpen(false);
            book(slot, category);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function UpcomingTermin({
  appt,
  busy,
  onCancel,
}: {
  appt: UpcomingDTO;
  busy: boolean;
  onCancel: (reason: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Objednaný termín
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">
            {clinicLongDate(appt.date)}
          </p>
          <p className="text-sm text-slate-600">
            {clinicTime(appt.startAt)}–{clinicTime(appt.endAt)} ·{" "}
            {TYPE_META[appt.appointmentType as AppointmentTypeLit]?.label ??
              appt.appointmentType}
          </p>
        </div>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Zrušiť termín
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-2 space-y-2 border-t border-emerald-200 pt-2">
          <TextareaField
            label="Dôvod zrušenia"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              fullWidth
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setReason("");
              }}
            >
              Späť
            </Button>
            <Button
              variant="danger"
              size="sm"
              fullWidth
              loading={busy}
              disabled={!reason.trim()}
              onClick={() => onCancel(reason.trim())}
            >
              Zrušiť termín
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
