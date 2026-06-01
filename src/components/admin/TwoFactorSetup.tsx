"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { apiSend } from "@/lib/client";

export function TwoFactorSetup({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const { busy, run } = useAsyncAction();
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function startSetup() {
    run(async () => {
      const r = await apiSend<{ qr: string; secret: string }>("/api/2fa/setup", "POST");
      setQr(r.qr);
      setSecret(r.secret);
    });
  }

  function enable() {
    run(
      async () => {
        await apiSend("/api/2fa/enable", "POST", { code });
        setEnabled(true);
        setQr(null);
        setSecret(null);
        setCode("");
      },
      { success: "Dvojfaktorové overenie zapnuté" },
    );
  }

  function disable() {
    run(
      async () => {
        await apiSend("/api/2fa/disable", "POST", { code });
        setEnabled(false);
        setCode("");
      },
      { success: "Dvojfaktorové overenie vypnuté" },
    );
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

      {enabled ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-emerald-700">2FA je zapnuté.</p>
          <p className="text-sm text-slate-500">
            Pre vypnutie zadajte aktuálny kód z aplikácie.
          </p>
          <CodeInput value={code} onChange={setCode} />
          <Button variant="danger" loading={busy} disabled={code.length !== 6} onClick={disable}>
            Vypnúť 2FA
          </Button>
        </div>
      ) : qr ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">
            Naskenujte QR kód v aplikácii (Google Authenticator, Authy…) a zadajte
            vygenerovaný kód.
          </p>
          <img src={qr} alt="2FA QR kód" className="h-44 w-44 rounded-lg ring-1 ring-slate-200" />
          {secret && (
            <p className="font-mono text-xs text-slate-400">Tajný kľúč: {secret}</p>
          )}
          <CodeInput value={code} onChange={setCode} />
          <Button variant="success" loading={busy} disabled={code.length !== 6} onClick={enable}>
            Potvrdiť a zapnúť
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-500">
            Pridajte druhý faktor pre vyššiu bezpečnosť prístupu k pacientskym dátam.
          </p>
          <Button className="mt-2" loading={busy} onClick={startSetup}>
            Zapnúť 2FA
          </Button>
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
      aria-label="Overovací kód"
      placeholder="123456"
      className="w-40 rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg tracking-widest text-slate-900 outline-none focus:border-slate-900"
    />
  );
}
