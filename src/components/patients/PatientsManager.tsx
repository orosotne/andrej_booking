"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserPlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiGet, apiSend } from "@/lib/client";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
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
  const [loading, setLoading] = useState(false);
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
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <UserPlus className="h-4 w-4" />
          Nový pacient
        </button>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hľadať podľa mena, priezviska, telefónu…"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-slate-400" />
        )}
      </div>

      <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        {patients.length === 0 && !loading && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">
            Žiadni pacienti
          </li>
        )}
        {patients.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setEditing(p)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">
                {p.lastName} {p.firstName}
              </span>
              <span className="text-sm text-slate-400">{p.phone ?? ""}</span>
            </button>
          </li>
        ))}
      </ul>

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
  const [form, setForm] = useState({
    firstName: patient?.firstName ?? "",
    lastName: patient?.lastName ?? "",
    dateOfBirth: patient?.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : "",
    phone: patient?.phone ?? "",
    email: patient?.email ?? "",
    externalPatientId: patient?.externalPatientId ?? "",
    note: patient?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: form.dateOfBirth || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      externalPatientId: form.externalPatientId || undefined,
      note: form.note || undefined,
    };
    try {
      if (patient) {
        await apiSend(`/api/patients/${patient.id}`, "PATCH", payload);
      } else {
        await apiSend("/api/patients", "POST", payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uloženie zlyhalo");
      setBusy(false);
    }
  }

  return (
    <Modal title={patient ? "Upraviť pacienta" : "Nový pacient"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meno" value={form.firstName} onChange={(v) => set("firstName", v)} required />
          <Field label="Priezvisko" value={form.lastName} onChange={(v) => set("lastName", v)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dátum narodenia" type="date" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} />
          <Field label="Telefón" value={form.phone} onChange={(v) => set("phone", v)} />
        </div>
        <Field label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} />
        <Field label="Interné číslo" value={form.externalPatientId} onChange={(v) => set("externalPatientId", v)} />
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Poznámka</span>
          <textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !form.firstName || !form.lastName}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Ukladám…" : "Uložiť"}
        </button>
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
      />
    </label>
  );
}
