"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserPlus, Users, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
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
  const { toast } = useToast();
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

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
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
      toast(patient ? "Pacient upravený" : "Pacient vytvorený", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uloženie zlyhalo", "error");
      setBusy(false);
    }
  }

  return (
    <Modal title={patient ? "Upraviť pacienta" : "Nový pacient"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meno" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          <Field label="Priezvisko" required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dátum narodenia" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          <Field label="Telefón" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <Field label="E-mail" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <Field label="Interné číslo" value={form.externalPatientId} onChange={(e) => set("externalPatientId", e.target.value)} />
        <TextareaField label="Poznámka" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} />
        <Button
          type="submit"
          fullWidth
          loading={busy}
          disabled={!form.firstName || !form.lastName}
        >
          Uložiť
        </Button>
      </form>
    </Modal>
  );
}
