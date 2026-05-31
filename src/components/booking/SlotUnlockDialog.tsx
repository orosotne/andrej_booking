"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { SlotDTO } from "@/lib/api-types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";

export function SlotUnlockDialog({
  slot,
  dayIso,
  onClose,
  onUnlocked,
}: {
  slot: SlotDTO;
  dayIso: string;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = TYPE_META[slot.appointmentType];

  async function unlock() {
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/slots/${slot.id}/unlock`, "POST", { reason });
      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Odomknutie zlyhalo");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Odomknúť slot"
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)} · ${meta.label}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Tento slot je zamknutý a štandardne sa otvorí{" "}
          {slot.releaseAt ? clinicDayChip(slot.releaseAt.slice(0, 10)) : "manuálne"}.
          Odomknutie je auditované.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Dôvod odomknutia *</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={unlock}
          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? "Odomykám…" : "Odomknúť slot"}
        </button>
      </div>
    </Modal>
  );
}
