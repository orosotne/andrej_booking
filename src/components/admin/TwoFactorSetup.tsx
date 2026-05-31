"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { apiSend } from "@/lib/client";

export function TwoFactorSetup({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<{ qr: string; secret: string }>("/api/2fa/setup", "POST");
      setQr(r.qr);
      setSecret(r.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/2fa/enable", "POST", { code });
      setEnabled(true);
      setQr(null);
      setSecret(null);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/2fa/disable", "POST", { code });
      setEnabled(false);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        {enabled ? (
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
        ) : (
          <ShieldOff className="h-5 w-5 text-slate-400" />
        )}
        Dvojfaktorová autentifikácia (TOTP)
      </h2>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {enabled ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-emerald-700">2FA je zapnuté.</p>
          <p className="text-sm text-slate-500">
            Pre vypnutie zadajte aktuálny kód z aplikácie.
          </p>
          <CodeInput value={code} onChange={setCode} />
          <button
            type="button"
            onClick={disable}
            disabled={busy || code.length !== 6}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Vypnúť 2FA
          </button>
        </div>
      ) : qr ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">
            Naskenujte QR kód v aplikácii (Google Authenticator, Authy…) a zadajte
            vygenerovaný kód.
          </p>
          <img
            src={qr}
            alt="2FA QR kód"
            className="h-44 w-44 rounded-lg ring-1 ring-slate-200"
          />
          {secret && (
            <p className="font-mono text-xs text-slate-400">Tajný kľúč: {secret}</p>
          )}
          <CodeInput value={code} onChange={setCode} />
          <button
            type="button"
            onClick={enable}
            disabled={busy || code.length !== 6}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Potvrdiť a zapnúť
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-500">
            Pridajte druhý faktor pre vyššiu bezpečnosť prístupu k pacientskym dátam.
          </p>
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Zapnúť 2FA
          </button>
        </div>
      )}
    </section>
  );
}

function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      placeholder="123456"
      className="w-40 rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg tracking-widest text-slate-900 outline-none focus:border-slate-900"
    />
  );
}
