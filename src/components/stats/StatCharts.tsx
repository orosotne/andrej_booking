"use client";

import {
  STAT_CATEGORIES,
  STAT_CATEGORY_LABEL,
  STAT_CATEGORY_SHORT,
  bucketShortLabel,
  type Granularity,
  type StatBucket,
  type StatCounts,
} from "@/lib/statistics";
import { STAT_CATEGORY_BAR } from "./stat-colors";

const STACK_ORDER = [...STAT_CATEGORIES].reverse();

/** Colour key shared by both charts and the table header. */
export function StatLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {STAT_CATEGORIES.map((c) => (
        <li key={c} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-sm ${STAT_CATEGORY_BAR[c]}`}
          />
          {STAT_CATEGORY_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip text for one period — the same breakdown the table row shows. */
function breakdown(label: string, counts: StatCounts, total: number): string {
  const lines = STAT_CATEGORIES.filter((c) => counts[c] > 0).map(
    (c) => `${STAT_CATEGORY_SHORT[c]}: ${counts[c]}`,
  );
  return [`${label} — spolu ${total}`, ...lines].join("\n");
}

/**
 * Stacked bars, one per period. Heights are pure CSS: the column is sized as a
 * share of the busiest period, and the segments inside split that height with
 * flex-grow in proportion to their counts — exact, and no viewBox maths.
 */
export function StatBarChart({
  buckets,
  granularity,
}: {
  buckets: StatBucket[];
  granularity: Granularity;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  // With many bars every label would collide, so thin them out evenly.
  const labelEvery = Math.ceil(buckets.length / 26);

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex h-52 w-8 shrink-0 flex-col justify-between py-0 text-right text-[10px] leading-none text-slate-400">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div aria-hidden className="absolute inset-x-0 top-0 h-52">
            {[0, 50, 100].map((p) => (
              <div
                key={p}
                className="absolute inset-x-0 border-t border-slate-100"
                style={{ top: `${p}%` }}
              />
            ))}
          </div>
          <div className="relative flex h-52 items-end gap-px border-b border-slate-200">
            {buckets.map((b) => (
              <div
                key={b.key}
                title={breakdown(b.label, b.counts, b.total)}
                className="flex h-full flex-1 items-end justify-center"
              >
                <div
                  className={`flex w-full flex-col overflow-hidden rounded-t-[3px] ${
                    buckets.length <= 6 ? "max-w-16" : "max-w-10"
                  }`}
                  style={{ height: `${(b.total / max) * 100}%` }}
                >
                  {/* Reversed so the first category sits at the bottom of the
                      stack, matching the left-to-right order of the share bar. */}
                  {STACK_ORDER.map((c) =>
                    b.counts[c] > 0 ? (
                      <div
                        key={c}
                        className={STAT_CATEGORY_BAR[c]}
                        style={{ flexGrow: b.counts[c], flexBasis: 0 }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-px pt-1.5">
            {buckets.map((b, i) => (
              <div
                key={b.key}
                className="min-w-0 flex-1 truncate text-center text-[10px] leading-none text-slate-400"
              >
                {i % labelEvery === 0 ? bucketShortLabel(granularity, b.key) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single 100 %-wide bar showing how the whole period splits by category. */
export function StatShareBar({
  counts,
  total,
}: {
  counts: StatCounts;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
      {STAT_CATEGORIES.map((c) =>
        counts[c] > 0 ? (
          <div
            key={c}
            className={STAT_CATEGORY_BAR[c]}
            title={`${STAT_CATEGORY_LABEL[c]}: ${counts[c]} (${Math.round((counts[c] / total) * 100)} %)`}
            style={{ width: `${(counts[c] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
