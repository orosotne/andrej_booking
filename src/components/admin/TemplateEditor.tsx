"use client";

import { useState } from "react";
import { Trash2, Plus, CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/client";

interface RuleDTO {
  id: string;
  startTime: string;
  endTime: string;
  appointmentType: string;
  isBookable: boolean;
  releasePolicyId: string | null;
}
interface TemplateDTO {
  id: string;
  name: string;
  dayOfWeek: number;
  rules: RuleDTO[];
}
interface PolicyLite {
  id: string;
  name: string;
}
interface SyncReport {
  dryRun: boolean;
  days: number;
  created: number;
  deleted: number;
  keptBooked: number;
}

const DAY_NAMES: Record<number, string> = {
  0: "Nedeľa",
  1: "Pondelok",
  2: "Utorok",
  3: "Streda",
  4: "Štvrtok",
  5: "Piatok",
  6: "Sobota",
};

const TYPE_OPTIONS = [
  { value: "PRE_HOSPITAL", label: "Akútne" },
  { value: "CONSULTATION_BLOCKED", label: "Poradňa (blok)" },
  { value: "DISPENSARY", label: "Dispenzárne" },
  { value: "ECHO", label: "ECHO" },
  { value: "ACUTE_RESERVE", label: "Akútna rezerva" },
  { value: "CUSTOM", label: "Iné" },
];

const COLOR_FOR_TYPE: Record<string, string> = {
  PRE_HOSPITAL: "pink",
  CONSULTATION_BLOCKED: "grey",
  DISPENSARY: "white",
  ECHO: "blue",
  ACUTE_RESERVE: "orange",
  CUSTOM: "white",
};

export function TemplateEditor({
  templates: initial,
  policies,
}: {
  templates: TemplateDTO[];
  policies: PolicyLite[];
}) {
  const [templates, setTemplates] = useState(initial);
  const { toast } = useToast();

  const updateRule = (tid: string, rule: RuleDTO) =>
    setTemplates((ts) =>
      ts.map((t) =>
        t.id === tid
          ? { ...t, rules: t.rules.map((r) => (r.id === rule.id ? rule : r)) }
          : t,
      ),
    );
  const removeRule = (tid: string, rid: string) =>
    setTemplates((ts) =>
      ts.map((t) =>
        t.id === tid ? { ...t, rules: t.rules.filter((r) => r.id !== rid) } : t,
      ),
    );

  async function addRule(tid: string) {
    try {
      const { rule } = await apiSend<{ rule: RuleDTO }>("/api/slot-rules", "POST", {
        templateId: tid,
        startTime: "09:00",
        endTime: "09:30",
        appointmentType: "DISPENSARY",
        color: "white",
        isBookable: true,
        releasePolicyId: null,
        priority: 100,
      });
      setTemplates((ts) =>
        ts.map((t) => (t.id === tid ? { ...t, rules: [...t.rules, rule] } : t)),
      );
      toast("Blok pridaný", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chyba", "error");
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Šablóna dňa</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Bloky určujú, ako sa generuje deň. Nové dni sa generujú podľa šablóny
        automaticky. Pre už vytvorené (budúce) dni použi tlačidlo{" "}
        <strong>{'„Použiť na nadchádzajúce dni"'}</strong> — pridá nové sloty a
        odoberie zrušené, rezervované termíny sa nikdy nezmažú.
      </p>

      {templates.map((t) => (
        <section key={t.id} className="mt-5 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {DAY_NAMES[t.dayOfWeek] ?? t.name}
          </h2>
          <div className="space-y-2">
            {[...t.rules]
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                policies={policies}
                onChange={(nr) => updateRule(t.id, nr)}
                onDeleted={() => removeRule(t.id, r.id)}
              />
            ))}
            {t.rules.length === 0 && (
              <p className="px-1 py-2 text-sm text-slate-400">Žiadne bloky.</p>
            )}
          </div>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => addRule(t.id)}>
            <Plus className="h-4 w-4" />
            Pridať blok
          </Button>
          <ApplyToFutureDays templateId={t.id} />
        </section>
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  policies,
  onChange,
  onDeleted,
}: {
  rule: RuleDTO;
  policies: PolicyLite[];
  onChange: (rule: RuleDTO) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(rule);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);

  const set = (patch: Partial<RuleDTO>) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    setBusy(true);
    try {
      await apiSend(`/api/slot-rules/${rule.id}`, "PATCH", {
        startTime: draft.startTime,
        endTime: draft.endTime,
        appointmentType: draft.appointmentType,
        color: COLOR_FOR_TYPE[draft.appointmentType] ?? "white",
        isBookable: draft.isBookable,
        releasePolicyId: draft.releasePolicyId,
      });
      toast("Blok uložený", "success");
      onChange(draft);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chyba", "error");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await apiSend(`/api/slot-rules/${rule.id}`, "DELETE");
      toast("Blok zmazaný", "success");
      onDeleted();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chyba", "error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
      <input
        type="time"
        value={draft.startTime}
        onChange={(e) => set({ startTime: e.target.value })}
        aria-label="Začiatok"
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-base tabular-nums outline-none focus:border-slate-900 sm:text-sm"
      />
      <span className="text-slate-400">–</span>
      <input
        type="time"
        value={draft.endTime}
        onChange={(e) => set({ endTime: e.target.value })}
        aria-label="Koniec"
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-base tabular-nums outline-none focus:border-slate-900 sm:text-sm"
      />
      <Select
        aria-label="Typ vyšetrenia"
        value={draft.appointmentType}
        onChange={(e) => set({ appointmentType: e.target.value })}
        options={TYPE_OPTIONS}
      />
      <Select
        aria-label="Pravidlo otvárania"
        value={draft.releasePolicyId ?? ""}
        onChange={(e) => set({ releasePolicyId: e.target.value || null })}
        options={[
          { value: "", label: "— bez pravidla —" },
          ...policies.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={draft.isBookable}
          onChange={(e) => set({ isBookable: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
        objednateľné
      </label>
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" disabled={!dirty} loading={busy} onClick={save}>
          Uložiť
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={del}
          aria-label="Zmazať blok"
          className="px-2 text-slate-400 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Re-applies the template to its already-generated future days. Shows a dry-run
// preview first, then performs the change only on confirmation.
function ApplyToFutureDays({ templateId }: { templateId: string }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<SyncReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setBusy(true);
    try {
      const { report } = await apiSend<{ report: SyncReport }>(
        `/api/templates/${templateId}/apply`,
        "POST",
        { dryRun: true },
      );
      setPreview(report);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chyba", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmApply() {
    setBusy(true);
    try {
      const { report } = await apiSend<{ report: SyncReport }>(
        `/api/templates/${templateId}/apply`,
        "POST",
        { dryRun: false },
      );
      toast(
        `Hotovo — pridaných ${report.created}, odobraných ${report.deleted}.`,
        "success",
      );
      setPreview(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chyba", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!preview) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-2 ml-2"
        loading={busy}
        onClick={loadPreview}
      >
        <CalendarSync className="h-4 w-4" />
        Použiť na nadchádzajúce dni
      </Button>
    );
  }

  const noChanges = preview.created === 0 && preview.deleted === 0;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      {noChanges ? (
        <p className="text-slate-600">
          Žiadne zmeny — {preview.days} budúcich dní už zodpovedá šablóne.
        </p>
      ) : (
        <p className="text-slate-700">
          V <strong>{preview.days}</strong> budúcich dňoch: pridá{" "}
          <strong>{preview.created}</strong> slotov, odoberie{" "}
          <strong>{preview.deleted}</strong>
          {preview.keptBooked > 0 && (
            <>
              , ponechá <strong>{preview.keptBooked}</strong> rezervovaných
            </>
          )}
          .
        </p>
      )}
      <div className="mt-2 flex gap-2">
        {!noChanges && (
          <Button size="sm" loading={busy} onClick={confirmApply}>
            Potvrdiť a použiť
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
          Zrušiť
        </Button>
      </div>
    </div>
  );
}
