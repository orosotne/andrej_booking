"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserPlus, Users, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";
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
}

type Editing = Patient | "new" | null;

export function PatientsManager() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const r = await apiGet<{ patients: Patient[] }>(
        `/api/patients?search=${encodeURIComponent(q)}`,
      );
      setPatients(r.patients);
    } finally {
      setLoading(false);
    }
  }, []);

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
                className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">
                  {p.lastName} {p.firstName}
                </span>
                <span className="text-sm text-slate-400">{p.phone ?? ""}</span>
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
  // Identity fields are frozen once a patient exists; only national ID + note stay editable.
  const locked = patient !== null;
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
            nationalId: form.nationalId || undefined,
            note: form.note || undefined,
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
    <Modal title={patient ? "Upraviť pacienta" : "Nový pacient"} onClose={onClose}>
      {patient && <PatientAppointment patientId={patient.id} />}
      <form onSubmit={save} className="space-y-3">
        {locked && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Identifikačné údaje (meno, priezvisko, rok narodenia, telefón) sa po
            vytvorení nedajú meniť. Upraviť možno rodné číslo a poznámku.
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

const HORIZONS: ReadonlyArray<{ months: number; label: string }> = [
  { months: 0, label: "Najbližší" },
  { months: 3, label: "o 3 mes." },
  { months: 6, label: "o 6 mes." },
  { months: 11, label: "o 11 mes." },
];

type BookType = (typeof BOOK_TYPES)[number]["type"];

interface UpcomingDTO {
  id: string;
  startAt: string;
  endAt: string;
  appointmentType: string;
  date: string;
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
  const [lookup, setLookup] = useState<{ months: number; slot: NextSlot | null } | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["patient-upcoming", patientId],
    queryFn: () =>
      apiGet<{ upcoming: UpcomingDTO | null }>(`/api/patients/${patientId}`),
  });
  const upcoming = data?.upcoming ?? null;

  async function lookupSlot(months: number) {
    setLookupBusy(true);
    setLookup(null);
    try {
      const r = await apiGet<{ slot: NextSlot | null }>(
        `/api/slots/next?type=${type}&months=${months}`,
      );
      setLookup({ months, slot: r.slot });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Hľadanie termínu zlyhalo", "error");
    } finally {
      setLookupBusy(false);
    }
  }

  function book(slot: NextSlot, category: PatientCategoryLit) {
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
          qc.invalidateQueries({ queryKey: ["patient-upcoming", patientId] });
          qc.invalidateQueries({ queryKey: ["calendar"] });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Načítavam termín…
      </div>
    );
  }

  if (upcoming) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Objednaný termín
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-900">
          {clinicLongDate(upcoming.date)}
        </p>
        <p className="text-sm text-slate-600">
          {clinicTime(upcoming.startAt)}–{clinicTime(upcoming.endAt)} ·{" "}
          {TYPE_META[upcoming.appointmentType as AppointmentTypeLit]?.label ??
            upcoming.appointmentType}
        </p>
      </div>
    );
  }

  const category = BOOK_TYPES.find((t) => t.type === type)?.category ?? "AKUTNE";
  const candidate = lookup && !lookupBusy ? lookup.slot : null;
  const noneFound = lookup !== null && !lookupBusy && lookup.slot === null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Nie je objednaný — rýchle objednanie
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {BOOK_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => {
              setType(t.type);
              setLookup(null);
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
            onClick={() => lookupSlot(h.months)}
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

      {noneFound && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Pre tento výber nie je žiadny voľný termín.
        </p>
      )}
    </div>
  );
}
