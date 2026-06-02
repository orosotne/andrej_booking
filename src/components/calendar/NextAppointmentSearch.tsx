"use client";

import { useState } from "react";
import { CalendarSearch, Loader2, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiGet } from "@/lib/client";
import { clinicLongDate, clinicTime } from "@/lib/format";

type NextType = "DISPENSARY" | "PRE_HOSPITAL" | "ECHO";

interface NextSlotResponse {
  slot:
    | {
        id: string;
        startAt: string;
        endAt: string;
        appointmentType: NextType;
        date: string;
      }
    | null;
}

const CATEGORIES: { key: NextType; label: string; color: string }[] = [
  {
    key: "DISPENSARY",
    label: "Dispenzár",
    color: "var(--slot-dispensary-bd)",
  },
  {
    key: "PRE_HOSPITAL",
    label: "Akútne",
    color: "var(--slot-prehospital-bd)",
  },
  {
    key: "ECHO",
    label: "ECHO",
    color: "var(--slot-echo-bd)",
  },
];

// months=0 → najbližší voľný termín (od zajtra, nie dnes);
// 3/6/11 → prvý voľný termín o aspoň toľko mesiacov.
const WINDOWS: { months: number; label: string }[] = [
  { months: 0, label: "Najbližší" },
  { months: 3, label: "o 3 mes." },
  { months: 6, label: "o 6 mes." },
  { months: 11, label: "o 11 mes." },
];

interface ResultKey {
  type: NextType;
  months: number;
}

interface ResultValue {
  loading: boolean;
  slot: NextSlotResponse["slot"];
}

function resultId(k: ResultKey) {
  return `${k.type}_${k.months}`;
}

export function NextAppointmentSearch({
  onPickDay,
}: {
  onPickDay: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, ResultValue>>({});

  async function search(k: ResultKey) {
    const id = resultId(k);
    setResults((r) => ({ ...r, [id]: { loading: true, slot: null } }));
    try {
      const r = await apiGet<NextSlotResponse>(
        `/api/slots/next?type=${k.type}&months=${k.months}`,
      );
      setResults((prev) => ({ ...prev, [id]: { loading: false, slot: r.slot } }));
    } catch {
      setResults((prev) => ({ ...prev, [id]: { loading: false, slot: null } }));
    }
  }

  function handleJump(iso: string) {
    onPickDay(iso);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Najbližší voľný termín"
        aria-label="Najbližší voľný termín"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <CalendarSearch className="h-4 w-4" />
        <span className="hidden sm:inline">Najbližší termín</span>
      </button>

      {open && (
        <Modal title="Najbližší voľný termín" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {CATEGORIES.map((cat) => (
              <section key={cat.key}>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: cat.color }}
                  />
                  <h3 className="text-sm font-semibold text-slate-900">
                    {cat.label}
                  </h3>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {WINDOWS.map((w) => {
                    return (
                      <button
                        key={w.months}
                        type="button"
                        onClick={() => search({ type: cat.key, months: w.months })}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
                <ResultStrip
                  results={results}
                  type={cat.key}
                  onJump={handleJump}
                />
              </section>
            ))}
            <div className="border-t border-slate-100 pt-2">
              <Button variant="outline" fullWidth onClick={() => setOpen(false)}>
                Zavrieť
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function ResultStrip({
  results,
  type,
  onJump,
}: {
  results: Record<string, ResultValue>;
  type: NextType;
  onJump: (iso: string) => void;
}) {
  const items = WINDOWS.map((w) => ({
    months: w.months,
    label: w.label,
    r: results[resultId({ type, months: w.months })],
  })).filter((x) => x.r);
  if (items.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {items.map((x) => (
        <li
          key={x.months}
          className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs ring-1 ring-slate-200"
        >
          <span className="font-medium text-slate-500">{x.label}:</span>
          {x.r.loading ? (
            <span className="flex items-center gap-1 text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Hľadám…
            </span>
          ) : x.r.slot ? (
            <button
              type="button"
              onClick={() => onJump(x.r.slot!.date)}
              className="group flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-900"
            >
              <span className="capitalize">{clinicLongDate(x.r.slot.date)}</span>
              <span className="font-mono tabular-nums">
                {clinicTime(x.r.slot.startAt)}
              </span>
              <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </button>
          ) : (
            <span className="text-slate-400">Žiadny voľný termín</span>
          )}
        </li>
      ))}
    </ul>
  );
}
