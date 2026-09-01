"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3 } from "lucide-react";
import { apiGet } from "@/lib/client";
import type { StatisticsResponse } from "@/lib/api-types";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  StatBarChart,
  StatLegend,
  StatShareBar,
} from "@/components/stats/StatCharts";
import { STAT_CATEGORIES, STAT_CATEGORY_LABEL, sumDispensary } from "@/lib/statistics";
import { STAT_CATEGORY_TEXT } from "@/components/stats/stat-colors";
import { trendRange } from "@/lib/dashboard";

/**
 * ADMIN-only trend, reusing /api/statistics verbatim (that route stays
 * ADMIN_ONLY, so a nurse never even issues the request — see `enabled`).
 * The query key matches StatisticsScreen's exactly, so navigating between
 * /prehlad and /statistika shares one cache entry instead of refetching.
 */
export function TrendSection({ today, enabled }: { today: string; enabled: boolean }) {
  const { from, to } = trendRange(today);
  const chartRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["statistics", "month", from, to],
    queryFn: () =>
      apiGet<StatisticsResponse>(
        `/api/statistics?granularity=month&from=${from}&to=${to}`,
      ),
    enabled,
  });

  // On a phone the 12-month chart is wider than the screen. Left-aligned it
  // opens on the oldest months — which for a clinic live since mid-2026 are
  // empty, so the chart reads as broken. Start at the recent end instead.
  useEffect(() => {
    const el = chartRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [data]);

  if (!enabled) return null;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-slate-400" aria-hidden />
          Objednaní pacienti za 12 mesiacov
        </h2>
        <Link
          href="/statistika"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          Zobraziť celú štatistiku
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {isLoading || !data ? (
        <Skeleton className="mt-3 h-52 w-full" />
      ) : data.total === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Za posledných 12 mesiacov nie sú žiadne objednávky.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums text-slate-900">
              {data.total.toLocaleString("sk-SK")}
            </span>
            <span className="text-sm text-slate-500">
              z toho dispenzár{" "}
              <span className="font-semibold text-emerald-700">
                {sumDispensary(data.totals).toLocaleString("sk-SK")}
              </span>
            </span>
          </div>
          <StatShareBar counts={data.totals} total={data.total} />
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STAT_CATEGORIES.map((c) => (
              <div key={c} className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{STAT_CATEGORY_LABEL[c]}</dt>
                <dd className={`text-lg font-semibold ${STAT_CATEGORY_TEXT[c]}`}>
                  {data.totals[c].toLocaleString("sk-SK")}
                </dd>
              </div>
            ))}
          </dl>
          <div ref={chartRef} className="overflow-x-auto">
            <div className="min-w-[32rem]">
              <StatBarChart buckets={data.buckets} granularity="month" />
            </div>
          </div>
          <StatLegend />
        </div>
      )}
    </section>
  );
}
