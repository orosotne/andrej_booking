"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button, type ButtonVariant } from "./Button";
import { Field, TextareaField } from "./Field";

export interface ConfirmExtras {
  reason?: string;
  password?: string;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Potvrdiť",
  cancelLabel = "Zrušiť",
  tone = "primary",
  requireReason = false,
  reasonLabel = "Dôvod",
  requirePassword = false,
  passwordLabel = "Heslo",
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
  requirePassword?: boolean;
  passwordLabel?: string;
  // Backward-compatible signature: callers receive both `reason` and `password`
  // as an object. Existing callers that ignored the second arg keep working.
  onConfirm: (extras: ConfirmExtras) => void | Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked =
    (requireReason && !reason.trim()) || (requirePassword && !password);

  async function confirm() {
    if (blocked) return;
    setBusy(true);
    try {
      await onConfirm({
        reason: requireReason ? reason.trim() : undefined,
        password: requirePassword ? password : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {description && <p className="text-sm text-slate-600">{description}</p>}
        {requirePassword && (
          <Field
            label={passwordLabel}
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
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
