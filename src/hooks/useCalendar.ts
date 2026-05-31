"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/client";
import type { CalendarResponse } from "@/lib/api-types";

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

/** Invalidates every cached calendar range after a mutation. */
export function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["calendar"] });
}
