"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, NotebookTabs, Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/client";
import { plural } from "@/lib/format";
import { birthYearShort } from "@/lib/booking-mark";

interface CategoryRow {
  id: string;
  name: string;
  patientCount: number;
}

interface MemberDTO {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  nationalId: string | null;
  phone: string | null;
}

interface CategoryDetail {
  id: string;
  name: string;
  patients: MemberDTO[];
}

// Prefix of every Poznámky query: invalidating it refreshes the list and any
// open subcategory at once.
const NOTES_KEY = ["note-categories"] as const;

const NAME_MAX = 40;

const patientsLabel = (n: number) =>
  `${n} ${plural(n, "pacient", "pacienti", "pacientov")}`;

// "Mrkvička Fero (60)" — the birth year tells namesakes apart.
function PatientName({ p }: { p: MemberDTO }) {
  const yy = birthYearShort(p.birthYear, p.nationalId);
  return (
    <span className="min-w-0 truncate">
      <span className="font-medium text-slate-900">
        {p.lastName} {p.firstName}
      </span>
      {yy && <span className="tabular-nums text-slate-400"> ({yy})</span>}
    </span>
  );
}

export function NotesManager() {
  const qc = useQueryClient();
  const { busy, run } = useAsyncAction();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: NOTES_KEY,
    queryFn: () => apiGet<{ categories: CategoryRow[] }>("/api/note-categories"),
  });
  const categories = data?.categories ?? [];

  function create(e: React.FormEvent) {
    e.preventDefault();
    run(() => apiSend("/api/note-categories", "POST", { name: name.trim() }), {
      success: "Podkategória pridaná",
      onDone: () => {
        setName("");
        qc.invalidateQueries({ queryKey: NOTES_KEY });
      },
    });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">Poznámky</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Podkategórie pacientov. Ich názvy sa zobrazujú červeným v poznámke
        pacienta — vidí ich aj sestra, meniť sa dajú len tu.
      </p>

      <form onSubmit={create} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          aria-label="Názov novej podkategórie"
          placeholder="Nová podkategória, napr. PCSK9I"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />
        <Button type="submit" loading={busy} disabled={!name.trim()} className="h-auto">
          <Plus className="h-4 w-4" />
          Pridať
        </Button>
      </form>

      {isLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : categories.length === 0 ? (
        <div className="mt-3 rounded-xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={NotebookTabs}
            title="Zatiaľ žiadne podkategórie"
            description="Pridajte prvú, napr. PCSK9I, a potom do nej vložte pacientov."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0 truncate font-semibold text-red-600">
                  {c.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums text-slate-500">
                  {patientsLabel(c.patientCount)}
                  <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && <CategoryDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CategoryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { busy, run } = useAsyncAction();
  // null = untouched, so the field follows the loaded name.
  const [name, setName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: [...NOTES_KEY, id],
    queryFn: () =>
      apiGet<{ category: CategoryDetail }>(`/api/note-categories/${id}`),
  });
  const category = data?.category;
  const nameValue = name ?? category?.name ?? "";
  const renamed =
    !!category && nameValue.trim() !== "" && nameValue.trim() !== category.name;

  // The calendar caches each patient's subcategory line too.
  function refresh() {
    qc.invalidateQueries({ queryKey: NOTES_KEY });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  }

  function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!renamed) return;
    run(
      () => apiSend(`/api/note-categories/${id}`, "PATCH", { name: nameValue.trim() }),
      {
        success: "Názov zmenený",
        onDone: () => {
          setName(null);
          refresh();
        },
      },
    );
  }

  function remove() {
    setConfirmDelete(false);
    run(() => apiSend(`/api/note-categories/${id}`, "DELETE"), {
      success: "Podkategória zmazaná",
      onDone: () => {
        refresh();
        onClose();
      },
    });
  }

  function addPatient(patientId: string) {
    run(
      () => apiSend(`/api/note-categories/${id}/patients`, "POST", { patientId }),
      { success: "Pacient pridaný", onDone: refresh },
    );
  }

  function removePatient(patientId: string) {
    run(
      () => apiSend(`/api/note-categories/${id}/patients/${patientId}`, "DELETE"),
      { success: "Pacient odobratý", onDone: refresh },
    );
  }

  return (
    <Modal
      title={category?.name ?? "Podkategória"}
      subtitle={category ? patientsLabel(category.patients.length) : undefined}
      onClose={onClose}
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : !category ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof Error ? error.message : "Podkategóriu sa nepodarilo načítať."}
        </p>
      ) : (
        <div className="space-y-4">
          <form onSubmit={rename} className="flex gap-2">
            <input
              value={nameValue}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              aria-label="Názov podkategórie"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-red-600 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
            <Button type="submit" variant="outline" disabled={!renamed || busy}>
              Premenovať
            </Button>
          </form>

          <AddPatientSearch
            memberIds={new Set(category.patients.map((p) => p.id))}
            busy={busy}
            onAdd={addPatient}
          />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pacienti v podkategórii
            </p>
            {category.patients.length === 0 ? (
              <p className="mt-1.5 text-sm text-slate-400">
                Zatiaľ žiadny pacient — vyhľadajte ho vyššie.
              </p>
            ) : (
              <ul className="mt-1.5 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
                {category.patients.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <PatientName p={p} />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removePatient(p.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      Odobrať
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {confirmDelete ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm">
              <p className="text-red-700">
                Naozaj zmazať podkategóriu „{category.name}“?
                {category.patients.length > 0 &&
                  ` Odoberie sa ${patientsLabel(category.patients.length)}, ich záznamy ostanú.`}
              </p>
              <div className="mt-2 flex justify-end gap-2">
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
                  Áno, zmazať
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Zmazať podkategóriu
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

// Searches registered patients (same endpoint and accent-insensitive matching
// as the Pacienti page) and offers to add the ones not yet in the subcategory.
function AddPatientSearch({
  memberIds,
  busy,
  onAdd,
}: {
  memberIds: Set<string>;
  busy: boolean;
  onAdd: (patientId: string) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const r = await apiGet<{ patients: MemberDTO[] }>(
          `/api/patients?search=${encodeURIComponent(q)}`,
        );
        setResults(r.patients);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Hľadanie pacienta zlyhalo", "error");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, toast]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pridať pacienta
      </p>
      <div className="relative mt-1.5">
        <Search
          className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Hľadať pacienta na pridanie"
          placeholder="Meno, priezvisko alebo telefón…"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-slate-400" />
        )}
      </div>
      {results.length > 0 && (
        <ul className="mt-1.5 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
          {results.map((p) => {
            const member = memberIds.has(p.id);
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <PatientName p={p} />
                {member ? (
                  <span className="shrink-0 text-xs text-slate-400">už je pridaný</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAdd(p.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Pridať
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
