"use client";

import { CalendarClock } from "lucide-react";
import type { DashboardResponse } from "@/lib/api-types";
import { clinicDayChip, clinicTime } from "@/lib/format";

const KINDS = [
  { key: "akut", label: "Akútne", color: "text-red-700" },
  { key: "disp", label: "Dispenzár", color: "text-emerald-700" },
  { key: "echo", label: "ECHO", color: "text-blue-700" },
] as const;

export function CapacityCards({
  capacity,
}: {
  capacity: DashboardResponse["capacity"];
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <CalendarClock className="h-4 w-4 text-slate-400" aria-hidden />
        Kapacita a najbližší voľný termín
      </h2>
      <p className="mt-0.5 text-sm text-slate-500">
        Voľné sloty v najbližších 14 a 30 dňoch. Zamknuté sloty sa nerátajú —
        ešte sa nedajú ponúknuť.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {KINDS.map(({ key, label, color }) => {
          const c = capacity[key];
          return (
            <div key={key} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className={`text-2xl font-semibold tabular-nums ${color}`}>
                {c.free14}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  do 14 dní
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {c.free30} voľných z {c.total30} do 30 dní
              </p>
              <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-xs text-slate-600">
                {c.nextFreeAt ? (
                  <>
                    Najbližší voľný:{" "}
                    <span className="font-medium text-slate-900">
                      {clinicDayChip(c.nextFreeAt.slice(0, 10))}{" "}
                      {clinicTime(c.nextFreeAt)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Žiadny voľný termín</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
