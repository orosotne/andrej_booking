"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/client";

export function ChangeOwnPassword() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newTrimmed = next.trim();
  const tooShort = newTrimmed.length > 0 && newTrimmed.length < 8;
  const mismatch = confirm.length > 0 && newTrimmed !== confirm.trim();
  const canSubmit =
    current.length > 0 && newTrimmed.length >= 8 && newTrimmed === confirm.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await apiSend("/api/profile/password", "POST", {
        currentPassword: current,
        newPassword: newTrimmed,
      });
      toast("Heslo zmenené", "success");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zmena hesla zlyhala");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 font-medium text-slate-900">
        <KeyRound className="h-4 w-4 text-slate-400" />
        Zmeniť heslo
      </h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <Field
          label="Súčasné heslo"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="Nové heslo"
          type="password"
          autoComplete="new-password"
          value={next}
          placeholder="aspoň 8 znakov"
          error={tooShort ? "Heslo musí mať aspoň 8 znakov" : undefined}
          onChange={(e) => setNext(e.target.value)}
        />
        <Field
          label="Zopakujte nové heslo"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={mismatch ? "Heslá sa nezhodujú" : undefined}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <Button type="submit" loading={busy} disabled={!canSubmit}>
          Zmeniť heslo
        </Button>
      </form>
    </div>
  );
}
