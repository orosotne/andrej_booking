"use client";

import { TrendingDown, TrendingUp, Minus, UserX } from "lucide-react";
import type { DashboardNoShowDTO } from "@/lib/api-types";

const pct = (r: number) => `${(r * 100).toFixed(1).replace(".", ",")} %`;

export function NoShowCard({ noShow }: { noShow: DashboardNoShowDTO }) {
  const { rate, previousRate, days } = noShow;
  // A rate over an empty denominator is "unknown", not "0 %" — saying 0 % would
  // read as "nobody ever misses an appointment".
  const delta = rate !== null && previousRate !== null ? rate - previousRate : null;
  const Trend = delta === null || Math.abs(delta) < 0.005
    ? Minus
    : delta > 0
      ? TrendingUp
      : TrendingDown;
  const trendTone =
    delta === null || Math.abs(delta) < 0.005
      ? "text-slate-400"
      : delta > 0
        ? "text-orange-700"
        : "text-emerald-700";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <UserX className="h-4 w-4 text-slate-400" aria-hidden />
        Neúčasť za posledných {days} dní
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Miera neúčasti</dt>
          <dd className="text-lg font-semibold text-slate-900">
            {rate === null ? "—" : pct(rate)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Oproti predošlým {days} dňom</dt>
          <dd className={`flex items-center gap-1 text-lg font-semibold ${trendTone}`}>
            <Trend className="h-4 w-4" aria-hidden />
            {delta === null ? "—" : pct(Math.abs(delta))}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Neprišli</dt>
          <dd className="text-lg font-semibold text-orange-700">
            {noShow.noShow}
            <span className="ml-1 text-sm font-normal text-slate-500">
              z {noShow.resolved}
            </span>
          </dd>
        </div>
        <div
          className={`rounded-xl px-3 py-2 ${
            noShow.unresolved > 0 ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50"
          }`}
        >
          <dt
            className={`text-xs ${noShow.unresolved > 0 ? "text-amber-700" : "text-slate-500"}`}
          >
            Bez zaznačenej účasti
          </dt>
          <dd
            className={`text-lg font-semibold ${
              noShow.unresolved > 0 ? "text-amber-800" : "text-slate-900"
            }`}
          >
            {noShow.unresolved}
          </dd>
        </div>
      </dl>
      {rate === null && (
        <p className="mt-2 text-xs text-slate-400">
          Zatiaľ nie je zaznačená účasť ani pri jednej minulej objednávke, takže
          mieru neúčasti nemožno spočítať.
        </p>
      )}
    </section>
  );
}
