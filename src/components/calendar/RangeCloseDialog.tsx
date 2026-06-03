"use client";

import { useState } from "react";
import { CalendarOff } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/client";

export function RangeCloseDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  // Conflict / failure message kept inline (not just a toast) so the doctor can
  // read which days still hold appointments while deciding what to reschedule.
  const [error, setError] = useState<string | null>(null);

  const invalid = !from || !to || from > to;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    setBusy(true);
    try {
      await apiSend("/api/vacations", "POST", {
        from,
        to,
        reason: reason.trim() || undefined,
      });
      toast("Dovolenka naplánovaná", "success");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operácia zlyhala");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Naplánovať dovolenku"
      subtitle="Zablokuje všetky pracovné dni v rozsahu. Ak sú v rozsahu objednaní pacienti, najprv ich presuňte inde — až potom sa dá dovolenka naplánovať. Spravovať ich vieš v sekcii Dovolenky."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Od"
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Field
            label="Do"
            type="date"
            required
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <TextareaField
          label="Dôvod (voliteľné)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="napr. dovolenka, školenie"
        />
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            Zrušiť
          </Button>
          <Button
            type="submit"
            variant="danger"
            fullWidth
            loading={busy}
            disabled={invalid}
          >
            <CalendarOff className="h-4 w-4" />
            Naplánovať dovolenku
          </Button>
        </div>
      </form>
    </Modal>
  );
}
