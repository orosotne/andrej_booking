"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Search,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppointmentActions } from "@/components/booking/AppointmentActions";
import { apiGet } from "@/lib/client";
import { clinicLongDate, clinicTime } from "@/lib/format";
import { apptStatusLabel } from "@/lib/slot-style";
import type { BookedAppointmentDTO } from "@/lib/api-types";

type Scope = "upcoming" | "past";

const PAGE_SIZES = [20, 50, 100] as const;

export function BookedAppointmentsManager() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BookedAppointmentDTO | null>(null);

  // Debounce the name search so typing doesn't fire a request per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["booked-appointments", scope, debounced, page, pageSize],
    queryFn: () =>
      apiGet<{ items: BookedAppointmentDTO[]; total: number }>(
        `/api/appointments?scope=${scope}&q=${encodeURIComponent(debounced)}&page=${page}&pageSize=${pageSize}`,
      ),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["booked-appointments"] });

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarClock className="h-5 w-5 text-slate-400" />
          Objednaní ľudia
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Prehľad všetkých objednaných pacientov a ich termínov. Kliknutím na riadok
          otvoríš detail, presun alebo zrušenie termínu.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button
            type="button"
            className={tab(scope === "upcoming")}
            onClick={() => {
              setScope("upcoming");
              setPage(1);
            }}
          >
            Nadchádzajúce
          </button>
          <button
            type="button"
            className={tab(scope === "past")}
            onClick={() => {
              setScope("past");
              setPage(1);
            }}
          >
            Minulé
          </button>
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Hľadať podľa mena…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Žiadne objednávky"
          description={
            debounced
              ? `Pre „${debounced}“ sa nenašla žiadna objednávka.`
              : scope === "upcoming"
                ? "Momentálne nie sú žiadne nadchádzajúce objednávky."
                : "Žiadne minulé objednávky."
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => (
              <BookedRow
                key={item.slot.appointment?.id ?? item.slot.id}
                item={item}
                showStatus={scope === "past"}
                onClick={() => setSelected(item)}
              />
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Na stránku:</span>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                {PAGE_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setPageSize(n);
                      setPage(1);
                    }}
                    className={`rounded-md px-2.5 py-1 text-sm font-medium tabular-nums transition ${
                      pageSize === n
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="tabular-nums">· spolu {total}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Predošlá strana"
                className="rounded-lg border border-slate-300 p-1.5 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm tabular-nums text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Ďalšia strana"
                className="rounded-lg border border-slate-300 p-1.5 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {selected?.slot.appointment && (
        <AppointmentActions
          slot={selected.slot}
          dayIso={selected.dayIso}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function BookedRow({
  item,
  showStatus,
  onClick,
}: {
  item: BookedAppointmentDTO;
  showStatus: boolean;
  onClick: () => void;
}) {
  const appt = item.slot.appointment;
  const name = appt
    ? `${appt.patient.lastName} ${appt.patient.firstName}`
    : "—";
  const when = useMemo(
    () => `${clinicLongDate(item.dayIso)} · ${clinicTime(item.slot.startAt)}`,
    [item.dayIso, item.slot.startAt],
  );

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{name}</p>
          <p className="mt-0.5 text-sm text-slate-500 first-letter:uppercase">
            {when}
            {showStatus && appt && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                {apptStatusLabel(appt.status)}
              </span>
            )}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    </li>
  );
}
