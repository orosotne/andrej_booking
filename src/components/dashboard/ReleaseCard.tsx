"use client";

import { Unlock, Lock } from "lucide-react";
import type { DashboardReleaseDTO, LockedSlotDTO } from "@/lib/api-types";
import { TYPE_META } from "@/lib/slot-style";
import { clinicDayChip, clinicTime, plural } from "@/lib/format";

export function ReleaseCard({
  release,
  manualLocks,
}: {
  release: DashboardReleaseDTO;
  /** ADMIN only — the payload omits this block entirely for other roles. */
  manualLocks?: { total: number; upcoming: LockedSlotDTO[] };
}) {
  const { last24h, nextAt, nextCount } = release;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Unlock className="h-4 w-4 text-slate-400" aria-hidden />
        Uvoľňovanie slotov
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          {/* "0" here is ambiguous — it means either "nothing was due" or "the
              cron failed" — so the label always names the window. */}
          <p className="text-xs text-slate-500">
            Uvoľnené za posledných 24 hodín
          </p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {last24h.total}
          </p>
          {last24h.total > 0 && (
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="text-red-700">{last24h.akut} akútne</span> ·{" "}
              <span className="text-emerald-700">{last24h.disp} dispenzár</span> ·{" "}
              <span className="text-blue-700">{last24h.echo} echo</span>
            </p>
          )}
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-xs text-slate-500">Najbližšie uvoľnenie</p>
          {nextAt ? (
            <>
              <p className="text-lg font-semibold text-slate-900">
                {clinicDayChip(nextAt.slice(0, 10))} o {clinicTime(nextAt)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {nextCount} {plural(nextCount, "slot", "sloty", "slotov")}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Žiadne naplánované uvoľnenie
            </p>
          )}
        </div>
      </div>

      {manualLocks && manualLocks.total > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Ručne zamknuté sloty ({manualLocks.total})
          </p>
          <ul className="mt-1 space-y-0.5">
            {manualLocks.upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-2 text-sm text-slate-600">
                <span className="tabular-nums">
                  {clinicDayChip(s.startAt.slice(0, 10))} {clinicTime(s.startAt)}
                </span>
                <span className="text-slate-400">
                  {TYPE_META[s.appointmentType].label}
                </span>
                {s.lockedReason && (
                  <span className="min-w-0 truncate text-slate-500">
                    — {s.lockedReason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
