"use client";

import { Lock, Check, User, Ban, Clock3 } from "lucide-react";
import type { SlotDTO } from "@/lib/api-types";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicDayChip } from "@/lib/format";

export function SlotCard({
  slot,
  onSelect,
}: {
  slot: SlotDTO;
  onSelect: (slot: SlotDTO) => void;
}) {
  const meta = TYPE_META[slot.appointmentType];
  const clickable =
    slot.status === "AVAILABLE" ||
    slot.status === "BOOKED" ||
    slot.status === "LOCKED";

  const isLocked = slot.status === "LOCKED";
  const isBlocked = slot.status === "BLOCKED";

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onSelect(slot)}
      style={{
        backgroundColor: isLocked ? "var(--surface)" : meta.bg,
        borderColor: meta.border,
      }}
      className={[
        "group relative w-full rounded-lg border border-l-4 px-2.5 py-2 text-left transition",
        "min-h-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30",
        clickable ? "cursor-pointer hover:shadow-sm hover:brightness-[0.99]" : "cursor-default",
        isLocked ? "slot-locked-hatch" : "",
        isBlocked ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[13px] font-medium tabular-nums text-slate-900">
          {clinicTime(slot.startAt)}
        </span>
        <StatusIcon status={slot.status} />
      </div>

      <div className="mt-1 leading-tight">
        {slot.status === "BOOKED" && slot.appointment ? (
          <p className="truncate text-sm font-semibold text-slate-900">
            {slot.appointment.patient.lastName} {slot.appointment.patient.firstName}
          </p>
        ) : slot.status === "AVAILABLE" ? (
          <p className="text-sm font-medium text-emerald-700">Voľné</p>
        ) : isBlocked ? (
          <p className="text-xs font-medium text-slate-500">Poradňa</p>
        ) : isLocked ? (
          <p className="text-[11px] font-medium text-slate-500">
            Otvorí sa {slot.releaseAt ? clinicDayChip(slot.releaseAt.slice(0, 10)) : "manuálne"}
          </p>
        ) : (
          <p className="text-xs font-medium text-slate-500">
            {slot.status === "COMPLETED" ? "Vybavené" : "Zrušené"}
          </p>
        )}
        <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-slate-400">
          {meta.label}
        </p>
      </div>
    </button>
  );
}

function StatusIcon({ status }: { status: SlotDTO["status"] }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "LOCKED":
      return <Lock className={`${cls} text-slate-400`} aria-label="Zamknuté" />;
    case "AVAILABLE":
      return <Clock3 className={`${cls} text-emerald-600`} aria-label="Voľné" />;
    case "BOOKED":
      return <User className={`${cls} text-slate-700`} aria-label="Obsadené" />;
    case "BLOCKED":
      return <Ban className={`${cls} text-slate-400`} aria-label="Blokované" />;
    case "COMPLETED":
      return <Check className={`${cls} text-emerald-600`} aria-label="Vybavené" />;
    default:
      return null;
  }
}
