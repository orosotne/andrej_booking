"use client";

import Link from "next/link";
import { Ban, CalendarDays, Phone, ArrowRight } from "lucide-react";
import type { DashboardDayDTO } from "@/lib/api-types";
import { SlotTally, SlotAvailByType } from "@/components/calendar/SlotTally";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { TYPE_META, apptStatusLabel } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";

const STATUS_TONE: Record<string, BadgeTone> = {
  SCHEDULED: "neutral",
  ARRIVED: "green",
  COMPLETED: "green",
  NO_SHOW: "red",
};

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold ${tone ?? "text-slate-900"}`}>
        {value}
      </dd>
    </div>
  );
}

export function DayPanel({
  day,
  isToday,
  next,
}: {
  day: DashboardDayDTO | null;
  isToday: boolean;
  next: DashboardDayDTO | null;
}) {
  if (!day) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <EmptyState
          icon={CalendarDays}
          title="Žiadny nadchádzajúci ordinačný deň"
          description="V najbližších dvoch mesiacoch nie je vygenerovaný ani jeden deň so slotmi."
        />
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
          {/* The clinic works Wed/Thu/Fri, so "dnes" is often not a clinic day —
              say which day this is rather than implying it is today. */}
          {isToday ? "Dnes" : "Najbližší ordinačný deň"}
          <span className="font-normal text-slate-500">
            · {clinicLongDate(day.date)}
          </span>
        </h2>
        <Link
          href={`/calendar?day=${day.date}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          Otvoriť v kalendári
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {day.status === "CLOSED" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm font-medium text-amber-800">
          <Ban className="h-4 w-4 shrink-0" aria-hidden />
          {day.holiday ? `Sviatok: ${day.holiday}` : (day.note ?? "Zatvorené")}
        </p>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:order-2">
          <dl className="grid grid-cols-2 gap-2">
            <Tile label="Objednaní" value={day.counts.booked} />
            <Tile
              label={isToday ? "Ešte voľných" : "Voľných"}
              value={isToday ? day.freeRemaining : day.counts.available}
              tone="text-emerald-700"
            />
            <Tile label="Prišli" value={day.arrived + day.completed} tone="text-emerald-700" />
            <Tile label="Neprišli" value={day.noShow} tone="text-orange-700" />
            {day.unresolved > 0 && (
              <div className="col-span-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                <dt className="text-xs text-amber-700">Bez zaznačenej účasti</dt>
                <dd className="text-lg font-semibold text-amber-800">
                  {day.unresolved}
                </dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <SlotTally
              counts={day.counts}
              freeWord={isToday ? "ešte voľných" : "voľných"}
            />
            <SlotAvailByType counts={day.byType} />
          </div>
          {next && (
            <Link
              href={`/calendar?day=${next.date}`}
              className="block rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-slate-100"
            >
              <p className="text-xs text-slate-500">
                Nasledujúci deň · {clinicDayChip(next.date)}
              </p>
              <p className="text-sm font-medium text-slate-900">
                {next.counts.booked} objednaných ·{" "}
                <span className="text-emerald-700">
                  {next.counts.available} voľných
                </span>
              </p>
            </Link>
          )}
        </div>

        <div className="lg:order-1 lg:col-span-2">
          {day.appointments.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Zatiaľ nikto nie je objednaný"
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {day.appointments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 py-1.5 text-sm">
                  <span className="w-12 shrink-0 font-medium tabular-nums text-slate-900">
                    {clinicTime(a.startAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                    {a.patientName}
                  </span>
                  {/* The name is the field that matters, so the meta drops to its
                      own line on a phone instead of squeezing the name to a
                      couple of letters. */}
                  <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 pl-12 sm:w-auto sm:pl-0">
                    <span className="shrink-0 text-xs text-slate-500">
                      {TYPE_META[a.appointmentType].label}
                    </span>
                    {a.phone && (
                      <a
                        href={`tel:${a.phone}`}
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 transition hover:text-slate-900"
                      >
                        <Phone className="h-3 w-3" aria-hidden />
                        {a.phone}
                      </a>
                    )}
                    <Badge
                      tone={STATUS_TONE[a.status] ?? "neutral"}
                      className="ml-auto shrink-0 sm:ml-0"
                    >
                      {apptStatusLabel(a.status)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
