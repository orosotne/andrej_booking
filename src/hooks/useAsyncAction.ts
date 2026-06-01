"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface RunOptions {
  /** Toast shown on success. Omit for silent success. */
  success?: string;
  /** Called after a successful action (e.g. close dialog, refresh). */
  onDone?: () => void;
}

/**
 * Standardizes the busy / try-catch / toast pattern for async UI actions.
 * On error it shows the error message as a toast and leaves `busy` false so the
 * surface (dialog/form) stays open for a retry.
 */
export function useAsyncAction() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>, options: RunOptions = {}) => {
      setBusy(true);
      try {
        await fn();
        if (options.success) toast(options.success, "success");
        options.onDone?.();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Operácia zlyhala", "error");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { busy, run };
}
