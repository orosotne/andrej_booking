"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/client";
import type { CalendarResponse, SlotCountsDTO } from "@/lib/api-types";

export function calendarKey(from: string, to: string) {
  return ["calendar", from, to] as const;
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: calendarKey(from, to),
    queryFn: () =>
      apiGet<CalendarResponse>(
        `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
}

// Aggregate counts for a (wide) range — used for the month/year totals without
// pulling the full slot payload. Keyed under "calendar" so useInvalidateCalendar
// refreshes it after a booking too.
export function calendarStatsKey(from: string, to: string) {
  return ["calendar", "stats", from, to] as const;
}

export function useCalendarStats(from: string, to: string) {
  return useQuery({
    queryKey: calendarStatsKey(from, to),
    queryFn: () =>
      apiGet<SlotCountsDTO>(
        `/api/calendar/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
}

/** Invalidates every cached calendar range after a mutation. */
export function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["calendar"] });
}
