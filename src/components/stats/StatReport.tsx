"use client";

import {
  DISPENSARY_CATEGORIES,
  STAT_CATEGORIES,
  STAT_CATEGORY_LABEL,
  STAT_CATEGORY_SHORT,
  GRANULARITY_LABEL,
  GRANULARITY_PLURAL,
  sumDispensary,
  type Granularity,
  type StatCategory,
} from "@/lib/statistics";
import type { StatisticsResponse } from "@/lib/api-types";
import { STAT_CATEGORY_TEXT } from "./stat-colors";
import { StatBarChart, StatLegend, StatShareBar } from "./StatCharts";

const NON_DISPENSARY: readonly StatCategory[] = ["ECHO", "AKUTNE"];

/** Averages carry decimals; one is enough ("2,5"), whole numbers stay bare. */
function fmtAvg(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("sk-SK");
}

/**
 * Everything the statistics page renders once the numbers are in: the totals
 * card, the stacked bar chart and the per-period table with the booking-day
 * averages. Kept free of fetching and period state so it is a pure function
 * of one StatisticsResponse.
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
  const dispensaryTotal = sumDispensary(data.totals);
  const averages = data.averages;

  const cell = (value: number, category: StatCategory) =>
    value > 0 ? STAT_CATEGORY_TEXT[category] : "text-slate-300";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-x-2">
            <span className="text-2xl font-semibold text-slate-900">
              {data.total}
            </span>
            <span className="text-sm text-slate-500">
              objednaných pacientov spolu
            </span>
          </div>
          <div className="flex items-baseline gap-x-2">
            <span className="text-2xl font-semibold text-emerald-700">
              {dispensaryTotal}
            </span>
            <span className="text-sm text-slate-500">z toho dispenzár</span>
          </div>
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
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">Obdobie</th>
                {DISPENSARY_CATEGORIES.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2.5 text-right font-medium whitespace-nowrap"
                  >
                    {STAT_CATEGORY_SHORT[c]}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                  Dispenzár spolu
                </th>
                {NON_DISPENSARY.map((c) => (
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
                  {DISPENSARY_CATEGORIES.map((c) => (
                    <td
                      key={c}
                      className={`px-3 py-2 text-right tabular-nums ${cell(b.counts[c], c)}`}
                    >
                      {b.counts[c]}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-700">
                    {sumDispensary(b.counts)}
                  </td>
                  {NON_DISPENSARY.map((c) => (
                    <td
                      key={c}
                      className={`px-3 py-2 text-right tabular-nums ${cell(b.counts[c], c)}`}
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
            {averages && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-slate-700">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    Priemer na {GRANULARITY_LABEL[granularity].toLowerCase()}{" "}
                    (št + pia)
                  </td>
                  {DISPENSARY_CATEGORIES.map((c) => (
                    <td key={c} className="px-3 py-2.5 text-right tabular-nums">
                      {fmtAvg(averages.counts[c])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                    {fmtAvg(averages.dispensary)}
                  </td>
                  {NON_DISPENSARY.map((c) => (
                    <td key={c} className="px-3 py-2.5 text-right tabular-nums">
                      {fmtAvg(averages.counts[c])}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {fmtAvg(averages.total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {averages && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Priemer je počítaný len z ambulantných dní — štvrtkov a piatkov;
            štátne sviatky sú z priemeru vylúčené. Načatý týždeň či mesiac sa
            započíta pomerne podľa počtu týchto dní.
          </p>
        )}
      </section>
    </div>
  );
}
