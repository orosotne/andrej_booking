"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Ban,
  CalendarOff,
  CheckCircle2,
  Palmtree,
  Sun,
} from "lucide-react";
import type { DashboardAttentionDTO } from "@/lib/api-types";
import { EmptyState } from "@/components/ui/EmptyState";
import { clinicDayChip, clinicShortDate } from "@/lib/format";

type Row = {
  key: string;
  Icon: LucideIcon;
  tone: string;
  text: React.ReactNode;
  href?: string;
};

function buildRows(a: DashboardAttentionDTO): Row[] {
  const rows: Row[] = [];

  // Thu/Fri that the generator should have produced. Normally empty — this is a
  // silent-cron-failure detector, not a routine to-do list.
  if (a.missingDays.length > 0) {
    rows.push({
      key: "missing",
      Icon: AlertTriangle,
      tone: "text-red-700",
      href: "/calendar",
      text: (
        <>
          <span className="font-medium">
            {a.missingDays.length} nevygenerovaných dní
          </span>{" "}
          — {a.missingDays.slice(0, 4).map(clinicDayChip).join(", ")}
          {a.missingDays.length > 4 && ` a ${a.missingDays.length - 4} ďalších`}
        </>
      ),
    });
  }

  for (const h of a.holidays.filter((x) => !x.handled)) {
    rows.push({
      key: `holiday-${h.iso}`,
      Icon: Sun,
      tone: "text-amber-700",
      href: "/calendar",
      text: (
        <>
          <span className="font-medium">{clinicShortDate(h.iso)}</span> —{" "}
          {h.name}: deň je ešte otvorený
        </>
      ),
    });
  }

  for (const v of a.vacations) {
    rows.push({
      key: `vac-${v.id}`,
      Icon: Palmtree,
      tone: "text-blue-700",
      text: (
        <>
          <span className="font-medium">
            {clinicShortDate(v.from)} – {clinicShortDate(v.to)}
          </span>{" "}
          — {v.reason ?? "dovolenka"}
        </>
      ),
    });
  }

  for (const iso of a.openedWednesdays) {
    rows.push({
      key: `wed-${iso}`,
      Icon: CheckCircle2,
      tone: "text-purple-700",
      href: `/calendar?day=${iso}`,
      text: (
        <>
          <span className="font-medium">{clinicShortDate(iso)}</span> — otvorená
          streda
        </>
      ),
    });
  }

  for (const d of a.closedDays) {
    rows.push({
      key: `closed-${d.date}`,
      Icon: Ban,
      tone: "text-slate-500",
      text: (
        <>
          <span className="font-medium">{clinicShortDate(d.date)}</span> —{" "}
          {d.holiday ?? d.note ?? "zatvorené"}
        </>
      ),
    });
  }
  return rows;
}

export function AttentionList({ attention }: { attention: DashboardAttentionDTO }) {
  const rows = buildRows(attention);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <CalendarOff className="h-4 w-4 text-slate-400" aria-hidden />
        Vyžaduje pozornosť
      </h2>
      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Všetko je v poriadku"
          description="Dni sú vygenerované, nič sa nechystá zatvoriť."
          className="py-6"
        />
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map(({ key, Icon, tone, text, href }) => {
            const body = (
              <span className="flex items-start gap-2 py-2 text-sm text-slate-700">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
                <span className="min-w-0">{text}</span>
              </span>
            );
            return (
              <li key={key}>
                {href ? (
                  <Link href={href} className="block transition hover:bg-slate-50">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
