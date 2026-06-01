"use client";

import { useState } from "react";
import { apiSend, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/Toast";
import { useInvalidateCalendar } from "@/hooks/useCalendar";
import { weekdayOf } from "@/lib/calendar-ui";
import { isLastFridayOfMonth, dateOnly } from "@/lib/calendar-date";

export type DayActionResult = "ok" | "conflict" | "error";

export interface OpenDayOptions {
  password?: string;
  overrideReason?: string;
}

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

  /** True iff opening this day requires the WEDNESDAY_UNLOCK_PASSWORD. */
  function requiresPassword(iso: string): boolean {
    const dow = weekdayOf(iso);
    if (dow === 3) return true;
    if (dow === 5 && isLastFridayOfMonth(dateOnly(iso))) return true;
    return false;
  }

  function openDay(iso: string, opts: OpenDayOptions = {}) {
    const usesOpen = requiresPassword(iso);
    return call(
      iso,
      () =>
        apiSend(
          `/api/calendar-days/${iso}/${usesOpen ? "open" : "generate"}`,
          "POST",
          usesOpen
            ? { password: opts.password, overrideReason: opts.overrideReason }
            : {},
        ),
      usesOpen ? "Deň otvorený" : "Deň vygenerovaný",
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

  return { pendingIso, openDay, deleteDay, closeDay, reopenDay, requiresPassword };
}
