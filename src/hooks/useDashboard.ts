"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client";
import type { DashboardResponse } from "@/lib/api-types";

export const dashboardKey = ["dashboard"] as const;

/**
 * The dashboard overrides two global query defaults (see providers.tsx:
 * refetchOnWindowFocus: false, no polling) — deliberately, and only here. This
 * is the one screen where staleness actively misleads ("koľko je ešte voľných
 * dnes") and the one most likely to sit open on a second monitor all morning.
 * staleTime stays at the global 30 s, which keeps rapid tab-switching from
 * triggering a refetch storm.
 */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKey,
    queryFn: () => apiGet<DashboardResponse>("/api/dashboard"),
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,
  });
}
