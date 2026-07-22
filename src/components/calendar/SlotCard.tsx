"use client";

import { Lock, Check, CheckCheck, User, Ban, Clock3, AlertTriangle } from "lucide-react";
import type { SlotDTO } from "@/lib/api-types";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicDayChip } from "@/lib/format";

export function SlotCard({
  slot,
  onSelect,
  highlight,
}: {
  slot: SlotDTO;
  onSelect: (slot: SlotDTO) => void;
  highlight?: boolean;
}) {
  const meta = TYPE_META[slot.appointmentType];
  // LOCKED + BLOCKED slots are not clickable for staff (no override flow exposed).
  // Admin still has unlock dialog for LOCKED via slot-actions menu.
  const clickable =
    slot.status === "AVAILABLE" || slot.status === "BOOKED" || slot.status === "LOCKED";

  const isLocked = slot.status === "LOCKED";
  const isBlocked = slot.status === "BLOCKED";
  const isEchoDept = slot.appointmentType === "ECHO_DEPARTMENT_BLOCKED";
  const isPorada = slot.appointmentType === "CONSULTATION_BLOCKED";

  // ECHO oddelenie & Porada both render as locked-dark blocks (cannot be opened).
  const isHardLocked = isEchoDept || (isPorada && isBlocked);

  // Žlté PENTA sloty (13:30–14:10 od 2/2027): žlté pozadie aj v zamknutom
  // stave + vodotlač PENTA. Obsadené sloty spred zmeny ostávajú modré (ECHO).
  const isPenta = slot.color === "yellow";

  return (
    <button
      type="button"
      id={`slot-${slot.id}`}
      disabled={!clickable || isHardLocked}
      onClick={() => clickable && !isHardLocked && onSelect(slot)}
      style={{
        backgroundColor: isPenta
          ? "var(--slot-penta)"
          : isHardLocked
            ? meta.bg
            : isLocked
              ? "var(--surface)"
              : meta.bg,
        borderColor: isPenta ? "var(--slot-penta-bd)" : meta.border,
        color: isEchoDept ? "var(--slot-echo-dept-fg)" : undefined,
      }}
      className={[
        "group relative w-full rounded-lg border border-l-4 px-2.5 py-2 text-left transition",
        "min-h-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30",
        clickable && !isHardLocked
          ? "cursor-pointer hover:shadow-sm hover:brightness-[0.99]"
          : "cursor-not-allowed",
        isLocked && !isHardLocked ? "slot-locked-hatch" : "",
        highlight ? "slot-flash" : "",
      ].join(" ")}
      aria-label={`${clinicTime(slot.startAt)} ${meta.label}`}
    >
      {isPenta && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden"
        >
          <span
            className="-rotate-12 text-[22px] font-black uppercase tracking-[0.15em]"
            style={{ color: "var(--slot-penta-wm)" }}
          >
            PENTA
          </span>
        </span>
      )}
      <div className="relative flex items-center justify-between gap-1">
        <span
          className="font-mono text-[13px] font-medium tabular-nums"
          style={isEchoDept ? { color: "var(--slot-echo-dept-fg)" } : undefined}
        >
          {clinicTime(slot.startAt)}
        </span>
        <StatusIcon
          status={slot.status}
          appointmentStatus={slot.appointment?.status}
          darkBg={isEchoDept}
        />
      </div>

      <div className="relative mt-1 leading-tight">
        {slot.status === "BOOKED" && slot.appointment ? (
          <p
            className={`flex items-center gap-1 truncate text-sm font-semibold ${
              slot.appointment.status === "COMPLETED"
                ? "text-emerald-700 line-through"
                : slot.appointment.status === "ARRIVED"
                  ? "text-slate-500 line-through"
                  : slot.appointment.status === "NO_SHOW"
                    ? "italic text-orange-700 line-through"
                    : "text-slate-900"
            }`}
          >
            {slot.appointment.status === "NO_SHOW" && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {slot.appointment.patient.lastName} {slot.appointment.patient.firstName}
            </span>
          </p>
        ) : isEchoDept ? (
          <p className="text-xs font-semibold uppercase tracking-wide">
            ECHO oddelenie
          </p>
        ) : isPorada ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Porada
          </p>
        ) : slot.status === "AVAILABLE" ? (
          <p className="text-sm font-medium text-emerald-700">Voľné</p>
        ) : isLocked ? (
          <div>
            <p className="text-[11px] font-semibold text-amber-700">
              Voľné, dočasne uzamknuté
            </p>
            <p className="text-[10px] text-slate-500">
              Otvorí sa{" "}
              {slot.releaseAt
                ? clinicDayChip(slot.releaseAt.slice(0, 10))
                : "manuálne"}
            </p>
          </div>
        ) : (
          <p className="text-xs font-medium text-slate-500">
            {slot.status === "COMPLETED" ? "Vybavené" : "Zrušené"}
          </p>
        )}
        {!isEchoDept && !isPorada && (
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-slate-400">
            {meta.label}
          </p>
        )}
      </div>
    </button>
  );
}

function StatusIcon({
  status,
  appointmentStatus,
  darkBg,
}: {
  status: SlotDTO["status"];
  appointmentStatus?: string;
  darkBg?: boolean;
}) {
  const cls = "h-3.5 w-3.5";
  const lockColor = darkBg ? "text-white/80" : "text-slate-400";
  switch (status) {
    case "LOCKED":
      return <Lock className={`${cls} ${lockColor}`} aria-label="Voľné, dočasne uzamknuté" />;
    case "AVAILABLE":
      return <Clock3 className={`${cls} text-emerald-600`} aria-label="Voľné" />;
    case "BOOKED":
      if (appointmentStatus === "COMPLETED")
        return <CheckCheck className={`${cls} text-emerald-700`} aria-label="Vybavený" />;
      if (appointmentStatus === "ARRIVED")
        return <Check className={`${cls} text-emerald-600`} aria-label="Prišiel" />;
      if (appointmentStatus === "NO_SHOW")
        return <AlertTriangle className={`${cls} text-orange-600`} aria-label="Neprišiel" />;
      return <User className={`${cls} text-slate-700`} aria-label="Obsadené" />;
    case "BLOCKED":
      return <Ban className={`${cls} ${darkBg ? "text-white/80" : "text-slate-400"}`} aria-label="Blokované" />;
    case "COMPLETED":
      return <Check className={`${cls} text-emerald-600`} aria-label="Vybavené" />;
    default:
      return null;
  }
}
