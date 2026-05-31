"use client";

import { useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { apiSend } from "@/lib/client";

interface PolicyDTO {
  id: string;
  name: string;
  releaseType: string;
  daysBefore: number | null;
  requiresAdminOverride: boolean;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}
function asBool(v: unknown): boolean {
  return v === true;
}

export function SettingsForm({
  initialSettings,
  initialPolicies,
}: {
  initialSettings: Record<string, unknown>;
  initialPolicies: PolicyDTO[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [policies, setPolicies] = useState(initialPolicies);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setSetting = (key: string, value: unknown) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const setDays = (id: string, days: number) =>
    setPolicies((ps) => ps.map((p) => (p.id === id ? { ...p, daysBefore: days } : p)));

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await apiSend("/api/settings", "PATCH", settings);
      await Promise.all(
        policies
          .filter((p) => p.releaseType === "DAYS_BEFORE")
          .map((p) =>
            apiSend(`/api/release-policies/${p.id}`, "PATCH", {
              daysBefore: p.daysBefore,
            }),
          ),
      );
      setMsg("Nastavenia uložené.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uloženie zlyhalo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">Nastavenia</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Pravidlá otvárania a systémové prepínače (nie sú hardcoded).
      </p>

      <Section title="Pravidlá otvárania slotov">
        <p className="mb-3 text-sm text-slate-500">
          Počet dní pred termínom, kedy sa sloty otvoria na objednávanie.
        </p>
        <div className="space-y-2">
          {policies
            .filter((p) => p.releaseType === "DAYS_BEFORE")
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-700">{p.name}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={p.daysBefore ?? 0}
                    onChange={(e) => setDays(p.id, Number(e.target.value))}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-slate-900 outline-none focus:border-slate-900"
                  />
                  <span className="text-sm text-slate-400">dní</span>
                </div>
              </div>
            ))}
        </div>
      </Section>

      <Section title="Systém">
        <NumberRow
          label="Generovať dopredu (mesiacov)"
          value={asNumber(settings.generateMonthsAhead, 12)}
          onChange={(v) => setSetting("generateMonthsAhead", v)}
        />
        <NumberRow
          label="Časový limit relácie (minút)"
          value={asNumber(settings.sessionTimeoutMinutes, 30)}
          onChange={(v) => setSetting("sessionTimeoutMinutes", v)}
        />
        <ToggleRow
          label="Povoliť slot 15:30–16:00"
          checked={asBool(settings.enableLateSlot)}
          onChange={(v) => setSetting("enableLateSlot", v)}
        />
        <ToggleRow
          label="Vyžadovať 2FA pre všetkých"
          checked={asBool(settings.twoFactorRequired)}
          onChange={(v) => setSetting("twoFactorRequired", v)}
        />
        <ToggleRow
          label="Ukladať citlivé údaje pacienta (rodné číslo, diagnózy)"
          checked={asBool(settings.storeSensitivePatientData)}
          onChange={(v) => setSetting("storeSensitivePatientData", v)}
        />
      </Section>

      <Section title="Export dát">
        <p className="mb-3 text-sm text-slate-500">
          Stiahnutie údajov vo formáte CSV (UTF-8). Export sa zaznamenáva do auditu.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/export?type=appointments"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export objednávok
          </a>
          <a
            href="/api/export?type=patients"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export pacientov
          </a>
        </div>
      </Section>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Uložiť
        </button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-slate-900 outline-none focus:border-slate-900"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
      />
    </label>
  );
}
