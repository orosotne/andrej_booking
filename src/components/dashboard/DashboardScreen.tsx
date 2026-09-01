"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, RefreshCw, AlertTriangle } from "lucide-react";
import type { Role } from "@/lib/auth/roles";
import { useDashboard, dashboardKey } from "@/hooks/useDashboard";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { clinicTime } from "@/lib/format";
import { DayPanel } from "./DayPanel";
import { CapacityCards } from "./CapacityCards";
import { AttentionList } from "./AttentionList";
import { ReleaseCard } from "./ReleaseCard";
import { NoShowCard } from "./NoShowCard";
import { TrendSection } from "./TrendSection";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {["h-56", "h-32", "h-24", "h-24"].map((h, i) => (
        <div
          key={i}
          className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
        >
          <Skeleton className="h-5 w-48" />
          <Skeleton className={`mt-3 w-full ${h}`} />
        </div>
      ))}
    </div>
  );
}

export function DashboardScreen({ role }: { role: Role }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, isFetching } = useDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <LayoutDashboard className="h-5 w-5 text-slate-400" aria-hidden />
            Prehľad
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Čo treba riešiť dnes a ako je na tom kapacita.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-xs text-slate-400 tabular-nums">
              Aktualizované o {clinicTime(data.generatedAt)}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: dashboardKey })}
          >
            <RefreshCw className="h-4 w-4" />
            Obnoviť
          </Button>
        </div>
      </div>

      {isError ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <EmptyState
            icon={AlertTriangle}
            title="Prehľad sa nepodarilo načítať"
            description="Skúste to znova tlačidlom Obnoviť."
          />
        </section>
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <DayPanel day={data.focus} isToday={data.focusIsToday} next={data.next} />
          <CapacityCards capacity={data.capacity} />
          <AttentionList attention={data.attention} />
          <ReleaseCard release={data.release} manualLocks={data.manualLocks} />
          <NoShowCard noShow={data.noShow} />
          {/* Trend is ADMIN-only: /api/statistics is ADMIN_ONLY, so the query is
              never issued for a doctor or nurse. */}
          <TrendSection today={data.today} enabled={role === "ADMIN"} />
        </>
      )}
    </div>
  );
}
