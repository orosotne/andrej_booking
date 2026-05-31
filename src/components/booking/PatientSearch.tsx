"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/client";

export interface PatientLite {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export function PatientSearch({
  onSelect,
}: {
  onSelect: (patient: PatientLite) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const r = await apiGet<{ patients: PatientLite[] }>(
          `/api/patients?search=${encodeURIComponent(q)}`,
        );
        setResults(r.patients);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (showCreate) {
    return (
      <CreatePatient
        initialName={query}
        onCancel={() => setShowCreate(false)}
        onCreated={onSelect}
      />
    );
  }

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Hľadať pacienta"
          placeholder="Hľadať pacienta (meno, priezvisko, telefón)…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-slate-400" />
        )}
      </div>

      <ul className="mt-2 max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {results.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="flex w-full items-center justify-between px-1 py-2.5 text-left transition hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">
                {p.lastName} {p.firstName}
              </span>
              {p.phone && <span className="text-sm text-slate-400">{p.phone}</span>}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        <UserPlus className="h-4 w-4" />
        Nový pacient
      </button>
    </div>
  );
}

function CreatePatient({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (p: PatientLite) => void;
}) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiSend<{ patient: PatientLite }>("/api/patients", "POST", {
        firstName,
        lastName,
        phone: phone || undefined,
      });
      toast("Pacient vytvorený", "success");
      onCreated(r.patient);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Chyba", "error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meno" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Field label="Priezvisko" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <Field label="Telefón" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" fullWidth onClick={onCancel}>
          Späť
        </Button>
        <Button type="submit" fullWidth loading={busy} disabled={!firstName || !lastName}>
          Vytvoriť a vybrať
        </Button>
      </div>
    </form>
  );
}
