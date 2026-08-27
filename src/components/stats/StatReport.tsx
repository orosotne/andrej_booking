"use client";

import {
  STAT_CATEGORIES,
  STAT_CATEGORY_LABEL,
  STAT_CATEGORY_SHORT,
  GRANULARITY_PLURAL,
  type Granularity,
} from "@/lib/statistics";
import type { StatisticsResponse } from "@/lib/api-types";
import { STAT_CATEGORY_TEXT } from "./stat-colors";
import { StatBarChart, StatLegend, StatShareBar } from "./StatCharts";

/**
 * Everything the statistics page renders once the numbers are in: the totals
 * card, the stacked bar chart and the per-period table. Kept free of fetching
 * and period state so it is a pure function of one StatisticsResponse.
 */
export function StatReport({
  data,
  granularity,
}: {
  data: StatisticsResponse;
  granularity: Granularity;
}) {
  const buckets = data.buckets;
  const filled = buckets.filter((b) => b.total > 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold text-slate-900">
            {data.total}
          </span>
          <span className="text-sm text-slate-500">
            objednaných pacientov spolu
          </span>
        </div>
        <div className="mt-3">
          <StatShareBar counts={data.totals} total={data.total} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STAT_CATEGORIES.map((c) => (
            <div key={c} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs leading-tight text-slate-500">
                {STAT_CATEGORY_LABEL[c]}
              </dt>
              <dd
                className={`mt-0.5 text-lg font-semibold ${STAT_CATEGORY_TEXT[c]}`}
              >
                {data.totals[c]}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {Math.round((data.totals[c] / data.total) * 100)} %
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-medium text-slate-700">
          Objednaní pacienti po {GRANULARITY_PLURAL[granularity]}
        </h2>
        <StatBarChart buckets={buckets} granularity={granularity} />
        <StatLegend />
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[35rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">Obdobie</th>
                {STAT_CATEGORIES.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2.5 text-right font-medium whitespace-nowrap"
                  >
                    {STAT_CATEGORY_SHORT[c]}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium">Spolu</th>
              </tr>
            </thead>
            <tbody>
              {filled.map((b) => (
                <tr
                  key={b.key}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-2 text-slate-700">{b.label}</td>
                  {STAT_CATEGORIES.map((c) => (
                    <td
                      key={c}
                      className={`px-3 py-2 text-right tabular-nums ${
                        b.counts[c] > 0
                          ? STAT_CATEGORY_TEXT[c]
                          : "text-slate-300"
                      }`}
                    >
                      {b.counts[c]}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {b.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
