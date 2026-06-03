import { Lock } from "lucide-react";
import type { SlotCountsDTO } from "@/lib/api-types";
import type { TypeAvail } from "@/lib/calendar-ui";

// Slim info strip: free / booked (+ locked when present), in the same colour
// language as the month grid. `freeWord` lets the day view say "ešte voľných".
export function SlotTally({
  counts,
  label,
  freeWord = "voľných",
}: {
  counts: SlotCountsDTO;
  label?: string;
  freeWord?: string;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200">
      {label && <span className="font-medium text-slate-500">{label}:</span>}
      <span>
        <span className="font-semibold text-emerald-700">{counts.available}</span>{" "}
        <span className="text-slate-500">{freeWord}</span>
      </span>
      <span aria-hidden className="text-slate-300">
        ·
      </span>
      <span>
        <span className="font-semibold text-slate-700">{counts.booked}</span>{" "}
        <span className="text-slate-500">obsadených</span>
      </span>
      {counts.locked > 0 && (
        <>
          <span aria-hidden className="text-slate-300">
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Lock className="h-3.5 w-3.5" />
            {counts.locked} zamknutých
          </span>
        </>
      )}
    </div>
  );
}

// Companion pill: free / total capacity by appointment kind. Same colour
// language as the month grid cells (pink/emerald/blue). Renders nothing when
// there are no bookable slots of any kind.
function AvailItem({
  stat,
  colorClass,
  label,
}: {
  stat: TypeAvail;
  colorClass: string;
  label: string;
}) {
  return (
    <span>
      <span className={`font-semibold ${colorClass}`}>{stat.free}</span>
      <span className="text-slate-400">/{stat.total}</span>{" "}
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

export function SlotAvailByType({
  counts,
  label = "Z toho voľných",
}: {
  counts: { akut: TypeAvail; disp: TypeAvail; echo: TypeAvail; custom: TypeAvail };
  label?: string;
}) {
  if (counts.akut.total + counts.disp.total + counts.echo.total + counts.custom.total === 0)
    return null;
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-slate-200">
      <span className="font-medium text-slate-500">{label}:</span>
      <AvailItem stat={counts.akut} colorClass="text-pink-700" label="akútne" />
      <span aria-hidden className="text-slate-300">·</span>
      <AvailItem stat={counts.disp} colorClass="text-emerald-700" label="dispenzárne" />
      <span aria-hidden className="text-slate-300">·</span>
      <AvailItem stat={counts.echo} colorClass="text-blue-700" label="ECHO" />
      {counts.custom.total > 0 && (
        <>
          <span aria-hidden className="text-slate-300">·</span>
          <AvailItem stat={counts.custom} colorClass="text-slate-700" label="iné" />
        </>
      )}
    </div>
  );
}
