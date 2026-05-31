"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
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
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = TYPE_META[slot.appointmentType];

  async function unlock() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await apiSend(`/api/slots/${slot.id}/unlock`, "POST", { reason });
      toast("Slot odomknutý", "success");
      onUnlocked();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Odomknutie zlyhalo", "error");
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
        <TextareaField
          label="Dôvod odomknutia"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <Button
          variant="primary"
          fullWidth
          loading={busy}
          disabled={!reason.trim()}
          onClick={unlock}
          className="bg-amber-500 hover:bg-amber-600"
        >
          Odomknúť slot
        </Button>
      </div>
    </Modal>
  );
}
