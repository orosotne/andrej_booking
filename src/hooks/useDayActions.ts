"use client";

import { useState } from "react";
import { apiSend, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/Toast";
import { useInvalidateCalendar } from "@/hooks/useCalendar";
import { weekdayOf } from "@/lib/calendar-ui";

export type DayActionResult = "ok" | "conflict" | "error";

/**
 * Single source of truth for calendar-day mutations (open/generate/delete/close/reopen),
 * shared by the week and month views. Returns "conflict" (e.g. a second Wednesday
 * in a month) without a toast so the caller can prompt for an audited override.
 */
export function useDayActions() {
  const invalidate = useInvalidateCalendar();
  const { toast } = useToast();
  const [pendingIso, setPendingIso] = useState<string | null>(null);

  async function call(
    iso: string,
    fn: () => Promise<unknown>,
    success: string,
  ): Promise<DayActionResult> {
    setPendingIso(iso);
    try {
      await fn();
      await invalidate();
      toast(success, "success");
      return "ok";
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT") return "conflict";
      toast(e instanceof Error ? e.message : "Operácia zlyhala", "error");
      return "error";
    } finally {
      setPendingIso(null);
    }
  }

  function openDay(iso: string, overrideReason?: string) {
    const isWednesday = weekdayOf(iso) === 3;
    return call(
      iso,
      () =>
        apiSend(
          `/api/calendar-days/${iso}/${isWednesday ? "open" : "generate"}`,
          "POST",
          overrideReason ? { overrideReason } : {},
        ),
      isWednesday ? "Streda otvorená" : "Deň vygenerovaný",
    );
  }

  function deleteDay(iso: string) {
    return call(iso, () => apiSend(`/api/calendar-days/${iso}`, "DELETE"), "Deň zrušený");
  }

  function closeDay(iso: string) {
    return call(
      iso,
      () => apiSend(`/api/calendar-days/${iso}/close`, "POST", { force: true }),
      "Deň zatvorený",
    );
  }

  function reopenDay(iso: string) {
    return call(
      iso,
      () => apiSend(`/api/calendar-days/${iso}/reopen`, "POST"),
      "Deň znovu otvorený",
    );
  }

  return { pendingIso, openDay, deleteDay, closeDay, reopenDay };
}
