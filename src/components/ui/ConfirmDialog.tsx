"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button, type ButtonVariant } from "./Button";
import { TextareaField } from "./Field";

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Potvrdiť",
  cancelLabel = "Zrušiť",
  tone = "primary",
  requireReason = false,
  reasonLabel = "Dôvod",
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ButtonVariant;
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = requireReason && !reason.trim();

  async function confirm() {
    if (blocked) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {description && <p className="text-sm text-slate-600">{description}</p>}
        {requireReason && (
          <TextareaField
            label={reasonLabel}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        )}
        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            fullWidth
            loading={busy}
            disabled={blocked}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
