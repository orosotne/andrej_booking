"use client";

import { useState } from "react";
import { CalendarOff } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { apiSend } from "@/lib/client";

export function RangeCloseDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { busy, run } = useAsyncAction();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");

  const invalid = !from || !to || !password || from > to;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    run(
      () =>
        apiSend<{ closed: number }>("/api/calendar-days/close-range", "POST", {
          from,
          to,
          password,
          reason: reason.trim() || undefined,
        }),
      { success: "Dni zatvorené (dovolenka)", onDone },
    );
  }

  return (
    <Modal
      title="Zatvoriť rozsah dní (dovolenka)"
      subtitle="Zablokuje všetky pracovné dni v rozsahu. Existujúce objednávky zostanú zachované."
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
        <Field
          label="Heslo"
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextareaField
          label="Dôvod (voliteľné)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="napr. dovolenka, školenie"
        />
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
            Zatvoriť rozsah
          </Button>
        </div>
      </form>
    </Modal>
  );
}
