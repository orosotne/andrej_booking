"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiGet } from "@/lib/client";
import {
  addMonths,
  clinicMonthLabel,
  isoAddDays,
  startOfMonth,
  todayIso,
} from "@/lib/format";
import {
  GRANULARITIES,
  GRANULARITY_LABEL,
  type Granularity,
} from "@/lib/statistics";
import type { StatisticsResponse } from "@/lib/api-types";
import { StatReport } from "./StatReport";

/**
 * How far back each period navigator reaches. The daily view walks by month,
 * the weekly and monthly views by year; the yearly view shows every year at
 * once and needs no navigator.
 */
function rangeFor(
  granularity: Granularity,
  month: string,
  year: number,
): { from: string; to: string } | null {
  if (granularity === "day") {
    return { from: month, to: isoAddDays(addMonths(month, 1), -1) };
  }
  if (granularity === "year") return null;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function StatisticsScreen() {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [month, setMonth] = useState(() => startOfMonth(todayIso()));
  const [year, setYear] = useState(() => Number(todayIso().slice(0, 4)));

  const range = rangeFor(granularity, month, year);

  const { data, isLoading } = useQuery({
    queryKey: ["statistics", granularity, range?.from ?? "", range?.to ?? ""],
    queryFn: () => {
      const params = new URLSearchParams({ granularity });
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      return apiGet<StatisticsResponse>(`/api/statistics?${params}`);
    },
  });

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
    }`;

  const navButton =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <BarChart3 className="h-5 w-5 text-slate-400" />
          Štatistika objednávok
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Koľko pacientov bolo objednaných v danom období — podľa dňa objednania,
          rozdelené podľa toho, ako ďaleko dopredu termín pripadol. Zrušené a
          presunuté objednávky sa nepočítajú.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              className={tab(granularity === g)}
              onClick={() => setGranularity(g)}
            >
              {GRANULARITY_LABEL[g]}
            </button>
          ))}
        </div>

        {granularity === "day" && (
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              aria-label="Predchádzajúci mesiac"
              className={navButton}
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-36 text-center text-sm font-medium text-slate-900">
              {clinicMonthLabel(month)}
            </span>
            <button
              type="button"
              aria-label="Nasledujúci mesiac"
              className={navButton}
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {(granularity === "week" || granularity === "month") && (
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              aria-label="Predchádzajúci rok"
              className={navButton}
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-16 text-center text-sm font-medium text-slate-900">
              {year}
            </span>
            <button
              type="button"
              aria-label="Nasledujúci rok"
              className={navButton}
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : data.total === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Žiadne objednávky"
          description="V zvolenom období nebol objednaný žiadny pacient."
        />
      ) : (
        <StatReport data={data} granularity={granularity} />
      )}
    </div>
  );
}
