import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { TYPE_META } from "@/lib/slot-style";
import { PATIENT_CATEGORY_LABEL } from "@/lib/patient-category";

const PAGE_SIZES = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

const dtFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: "Europe/Bratislava",
  dateStyle: "short",
  timeStyle: "short",
});
const dateOnlyFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: "Europe/Bratislava",
  dateStyle: "short",
});

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "admin",
  DOCTOR: "lekár",
  NURSE: "sestra",
};
const ROLE_CHIP: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-700",
  DOCTOR: "bg-sky-100 text-sky-700",
  NURSE: "bg-emerald-100 text-emerald-700",
};

const APPT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "objednaný",
  ARRIVED: "prišiel",
  NO_SHOW: "neprišiel",
  CANCELLED: "zrušené",
  RESCHEDULED: "presunuté",
  COMPLETED: "vybavené",
};

const ACTION_LABEL: Record<string, string> = {
  "patient.create": "Pridaný pacient",
  "patient.update": "Upravený pacient",
  "patient.delete": "Vymazaný pacient",
  "appointment.create": "Objednanie",
  "appointment.cancel": "Zrušenie objednávky",
  "appointment.reschedule": "Presun termínu",
  "appointment.update": "Úprava objednávky",
  "slot.lock": "Zamknutie slotu",
  "slot.unlock": "Odomknutie slotu",
  "calendar_day.delete": "Vymazanie dňa",
  "calendar_day.open": "Otvorenie dňa",
  "calendar_day.close": "Zatvorenie dňa",
  "calendar_day.reopen": "Znovuotvorenie dňa",
  "calendar_day.generate": "Generovanie dňa",
  "user.create": "Pridaný používateľ",
  "user.update": "Upravený používateľ",
  "user.delete": "Vymazaný používateľ",
};

const PATIENT_FIELD_LABEL: Record<string, string> = {
  nationalId: "rodné číslo",
  dateOfBirth: "dátum nar.",
  email: "e-mail",
  phone: "telefón",
  externalPatientId: "externé ID",
  note: "poznámka",
};

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function fmtIsoDateTime(iso: unknown): string | null {
  const s = str(iso);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : dtFmt.format(d);
}
function fmtIsoDate(iso: unknown): string | null {
  const s = str(iso);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : dateOnlyFmt.format(d);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  const sp = await searchParams;
  const pageSize = PAGE_SIZES.includes(Number(sp.pageSize))
    ? Number(sp.pageSize)
    : DEFAULT_PAGE_SIZE;
  const total = await prisma.auditLog.count();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRaw = Number(sp.page);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1
      ? Math.min(Math.floor(pageRaw), totalPages)
      : 1;

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { actor: { select: { name: true, role: true } } },
  });

  // Walk the snapshots once to collect every referenced patient/slot id; one
  // batch query per kind keeps the page fast even at 100 rows.
  const patientIds = new Set<string>();
  const slotIds = new Set<string>();
  for (const log of logs) {
    const before = asObj(log.beforeData);
    const after = asObj(log.afterData);
    if (log.entityType === "patient") {
      patientIds.add(log.entityId);
    } else if (log.entityType === "appointment") {
      for (const src of [before, after]) {
        const pid = str(src?.patientId);
        if (pid) patientIds.add(pid);
        const sid = str(src?.slotId);
        if (sid) slotIds.add(sid);
      }
      const nested = asObj(after?.newAppointment);
      const npid = str(nested?.patientId);
      if (npid) patientIds.add(npid);
      const nsid = str(nested?.slotId);
      if (nsid) slotIds.add(nsid);
      const from = str(after?.rescheduledFrom);
      if (from) slotIds.add(from);
    } else if (log.entityType === "slot") {
      slotIds.add(log.entityId);
    }
  }

  const [patients, slots] = await Promise.all([
    patientIds.size
      ? prisma.patient.findMany({
          where: { id: { in: [...patientIds] } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve(
          [] as { id: string; firstName: string; lastName: string }[],
        ),
    slotIds.size
      ? prisma.appointmentSlot.findMany({
          where: { id: { in: [...slotIds] } },
          select: { id: true, startAt: true, appointmentType: true },
        })
      : Promise.resolve(
          [] as { id: string; startAt: Date; appointmentType: string }[],
        ),
  ]);

  const patientById = new Map(
    patients.map((p) => [p.id, `${p.lastName} ${p.firstName}`.trim()]),
  );
  const slotById = new Map(
    slots.map((s) => [
      s.id,
      `${dtFmt.format(s.startAt)} · ${
        TYPE_META[s.appointmentType as keyof typeof TYPE_META]?.label ??
        s.appointmentType
      }`,
    ]),
  );

  function patientFromIdOrSnapshot(
    id: string | undefined,
    snapshot: Record<string, unknown> | null,
  ): string {
    if (id && patientById.has(id)) return patientById.get(id)!;
    const fn = str(snapshot?.firstName) ?? "";
    const ln = str(snapshot?.lastName) ?? "";
    const name = `${ln} ${fn}`.trim();
    if (name) return name;
    return id ? `pacient #${id.slice(-6)}` : "neznámy pacient";
  }
  function slotLabelOrNull(id: string | undefined): string | null {
    return id ? (slotById.get(id) ?? null) : null;
  }

  function describe(log: (typeof logs)[number]): ReactNode {
    const before = asObj(log.beforeData);
    const after = asObj(log.afterData);
    const key = `${log.entityType}.${log.action}`;

    switch (key) {
      case "patient.create":
        return (
          <strong>
            {patientFromIdOrSnapshot(log.entityId, after)}
          </strong>
        );
      case "patient.delete":
        return (
          <strong>
            {patientFromIdOrSnapshot(log.entityId, before)}
          </strong>
        );
      case "patient.update": {
        const name = patientFromIdOrSnapshot(log.entityId, before ?? after);
        const changes: ReactNode[] = [];
        for (const field of Object.keys(PATIENT_FIELD_LABEL)) {
          const b = before?.[field];
          const a = after?.[field];
          const bs = b === null || b === undefined ? "" : String(b);
          const as_ = a === null || a === undefined ? "" : String(a);
          if (bs === as_) continue;
          const label = PATIENT_FIELD_LABEL[field];
          const fmt = (v: string) =>
            field === "dateOfBirth" ? (fmtIsoDate(v) ?? v) : v;
          changes.push(
            <span key={field} className="mr-3">
              <span className="text-slate-400">{label}:</span>{" "}
              <span className="text-slate-400 line-through">
                {bs ? fmt(bs) : "—"}
              </span>{" "}
              <span className="text-slate-400">→</span>{" "}
              <strong>{as_ ? fmt(as_) : "—"}</strong>
            </span>,
          );
        }
        return (
          <span>
            <strong>{name}</strong>
            {changes.length > 0 && (
              <span className="ml-2 text-slate-600">— {changes}</span>
            )}
          </span>
        );
      }
      case "appointment.create": {
        const pid = str(after?.patientId);
        const sid = str(after?.slotId);
        const slotLbl = slotLabelOrNull(sid);
        const cat = str(after?.patientCategory);
        return (
          <span>
            <strong>{patientFromIdOrSnapshot(pid, after)}</strong>
            {slotLbl && (
              <>
                {" "}
                na <strong>{slotLbl}</strong>
              </>
            )}
            {cat && (
              <span className="ml-1 text-slate-500">
                (
                {PATIENT_CATEGORY_LABEL[
                  cat as keyof typeof PATIENT_CATEGORY_LABEL
                ] ?? cat}
                )
              </span>
            )}
          </span>
        );
      }
      case "appointment.cancel": {
        const pid = str(before?.patientId);
        const slotSnap = asObj(before?.slot);
        const slotTime =
          (slotSnap && fmtIsoDateTime(slotSnap.startAt)) ??
          slotLabelOrNull(str(before?.slotId));
        return (
          <span>
            <strong>{patientFromIdOrSnapshot(pid, before)}</strong>
            {slotTime && (
              <>
                {" "}
                — termín <strong>{slotTime}</strong>
              </>
            )}
          </span>
        );
      }
      case "appointment.reschedule": {
        const pid = str(before?.patientId);
        const slotSnap = asObj(before?.slot);
        const fromTime =
          (slotSnap && fmtIsoDateTime(slotSnap.startAt)) ??
          slotLabelOrNull(str(before?.slotId));
        const newAppt = asObj(after?.newAppointment);
        const toTime = slotLabelOrNull(str(newAppt?.slotId));
        return (
          <span>
            <strong>{patientFromIdOrSnapshot(pid, before)}</strong>:{" "}
            {fromTime ? <strong>{fromTime}</strong> : "—"}{" "}
            <span className="text-slate-400">→</span>{" "}
            {toTime ? <strong>{toTime}</strong> : "—"}
          </span>
        );
      }
      case "appointment.update": {
        const pid = str(before?.patientId) ?? str(after?.patientId);
        const parts: ReactNode[] = [];
        const bStatus = str(before?.status);
        const aStatus = str(after?.status);
        if (bStatus && aStatus && bStatus !== aStatus) {
          parts.push(
            <span key="status" className="mr-3">
              <span className="text-slate-400">stav:</span>{" "}
              <span className="text-slate-400 line-through">
                {APPT_STATUS_LABEL[bStatus] ?? bStatus}
              </span>{" "}
              <span className="text-slate-400">→</span>{" "}
              <strong>{APPT_STATUS_LABEL[aStatus] ?? aStatus}</strong>
            </span>,
          );
        }
        const bNote = str(before?.note) ?? "";
        const aNote = str(after?.note) ?? "";
        if (bNote !== aNote) {
          parts.push(
            <span key="note" className="mr-3 text-slate-500">
              poznámka zmenená
            </span>,
          );
        }
        return (
          <span>
            <strong>{patientFromIdOrSnapshot(pid, before ?? after)}</strong>
            {parts.length > 0 && (
              <span className="ml-2 text-slate-600">— {parts}</span>
            )}
          </span>
        );
      }
      case "slot.lock":
      case "slot.unlock": {
        const lbl = slotLabelOrNull(log.entityId);
        return <span>{lbl ?? `slot #${log.entityId.slice(-6)}`}</span>;
      }
      case "calendar_day.delete": {
        const date = fmtIsoDate(before?.date);
        const purged =
          typeof before?.purgedAppointments === "number"
            ? before.purgedAppointments
            : null;
        return (
          <span>
            <strong>{date ?? "—"}</strong>
            {purged !== null && purged > 0 && (
              <span className="ml-1 text-slate-500">
                (zrušených {purged} objednávok)
              </span>
            )}
          </span>
        );
      }
      default: {
        const label =
          str(after?.name) ?? str(after?.email) ?? str(before?.name) ?? str(before?.email);
        return (
          <span className="text-slate-500">
            {label ?? `${log.entityType} #${log.entityId.slice(-6)}`}
          </span>
        );
      }
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Audit zmien</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Spolu {total} záznamov · strana {page} z {totalPages}
      </p>

      {/* Desktop: full table */}
      <div className="mt-4 hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Čas</th>
              <th className="px-3 py-2 font-medium">Kto</th>
              <th className="px-3 py-2 font-medium">Akcia</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium">Dôvod</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.map((log) => {
              const role = log.actor?.role ?? null;
              return (
                <tr key={log.id} className="align-top text-slate-700">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                    {dtFmt.format(log.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{log.actor?.name ?? "—"}</span>
                      {role && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            ROLE_CHIP[role] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {ROLE_LABEL[role] ?? role.toLowerCase()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">
                      {ACTION_LABEL[`${log.entityType}.${log.action}`] ??
                        `${log.entityType} · ${log.action}`}
                    </span>
                  </td>
                  <td className="px-3 py-2">{describe(log)}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {log.reason ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per audit entry */}
      <ul className="mt-4 space-y-2 md:hidden">
        {logs.map((log) => {
          const role = log.actor?.role ?? null;
          return (
            <li key={log.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                  {ACTION_LABEL[`${log.entityType}.${log.action}`] ??
                    `${log.entityType} · ${log.action}`}
                </span>
                <span className="shrink-0 font-mono text-xs text-slate-400">
                  {dtFmt.format(log.createdAt)}
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-700">{describe(log)}</div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500">{log.actor?.name ?? "—"}</span>
                {role && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      ROLE_CHIP[role] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ROLE_LABEL[role] ?? role.toLowerCase()}
                  </span>
                )}
              </div>
              {log.reason && (
                <p className="mt-2 text-xs text-slate-500">Dôvod: {log.reason}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Na stránku:</span>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {PAGE_SIZES.map((n) => (
              <Link
                key={n}
                href={`/audit?page=1&pageSize=${n}`}
                className={`rounded-md px-2.5 py-1 text-sm font-medium tabular-nums transition ${
                  pageSize === n
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {n}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={`/audit?page=${page - 1}&pageSize=${pageSize}`}
              aria-label="Predošlá strana"
              className="rounded-lg border border-slate-300 p-1.5 text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 p-1.5 text-slate-300">
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span className="text-sm tabular-nums text-slate-600">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/audit?page=${page + 1}&pageSize=${pageSize}`}
              aria-label="Ďalšia strana"
              className="rounded-lg border border-slate-300 p-1.5 text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 p-1.5 text-slate-300">
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
