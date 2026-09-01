"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { SlotDTO } from "@/lib/api-types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import { clinicTime, clinicLongDate, clinicDayChip } from "@/lib/format";
import {
  SLOT_DESIGNATIONS,
  DESIGNATION_LABEL,
  designationOf,
  resolveDesignation,
  type SlotDesignation,
} from "@/lib/slot-designation";

/**
 * What the slot will look like afterwards, in one line. Computed with the very
 * same resolveDesignation the server will run, so the preview cannot drift from
 * the outcome — that is the point of keeping the mapping Prisma-free.
 */
function consequence(
  designation: SlotDesignation,
  slot: SlotDTO,
): string {
  const t = resolveDesignation(designation, {
    status: slot.status,
    releaseAt: slot.releaseAt ? new Date(slot.releaseAt) : null,
  });
  if (designation === "ECHO_PENTA") {
    return "Slot bude zamknutý a otvoriť sa dá len heslom. Zobrazí sa žlto s vodotlačou PENTA.";
  }
  if (t.status === "BLOCKED") {
    return "Slot bude blokovaný — nedá sa doň objednať.";
  }
  if (t.status === "AVAILABLE") {
    return "Slot ostane voľný.";
  }
  if (t.manualLock) {
    return "Slot bude zamknutý (ručný zámok) — otvoriť ho treba samostatne heslom.";
  }
  return t.releaseAt
    ? `Slot ostane zamknutý a otvorí sa ${clinicDayChip(t.releaseAt.toISOString().slice(0, 10))}.`
    : "Slot ostane zamknutý a otvorí sa len manuálne.";
}

export function SlotDesignationDialog({
  slot,
  dayIso,
  onClose,
  onChanged,
}: {
  slot: SlotDTO;
  dayIso: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { busy, run } = useAsyncAction();
  const current = designationOf(slot);
  const [designation, setDesignation] = useState<SlotDesignation>(current);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const meta = TYPE_META[slot.appointmentType];
  const changed = designation !== current;

  function submit() {
    if (!password || !changed) return;
    run(
      () =>
        apiSend(`/api/slots/${slot.id}`, "PATCH", {
          designation,
          password,
          reason: reason.trim() || undefined,
        }),
      {
        success: `Určenie zmenené na „${DESIGNATION_LABEL[designation]}“`,
        onDone: onChanged,
      },
    );
  }

  return (
    <Modal
      title="Zmeniť určenie slotu"
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)} · ${meta.label}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Nové určenie <span className="text-rose-600">*</span>
          </legend>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {SLOT_DESIGNATIONS.map((d) => {
              const selected = designation === d;
              const isCurrent = d === current;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDesignation(d)}
                  aria-pressed={selected}
                  className={[
                    "rounded-lg border px-3 py-2 text-left text-sm capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30",
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-900 hover:border-slate-400",
                  ].join(" ")}
                >
                  <span className="block font-medium">{DESIGNATION_LABEL[d]}</span>
                  {isCurrent && (
                    <span
                      className={[
                        "block text-[11px] leading-snug",
                        selected ? "text-white/70" : "text-slate-500",
                      ].join(" ")}
                    >
                      súčasné
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {changed
            ? `${consequence(designation, slot)} Zmena je chránená heslom a auditovaná.`
            : "Vyberte iné určenie, než má slot teraz."}
        </p>

        <Field
          label="Heslo"
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextareaField
          label="Dôvod zmeny (nepovinné)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <Button
          variant="primary"
          fullWidth
          loading={busy}
          disabled={!password || !changed}
          onClick={submit}
        >
          Zmeniť určenie
        </Button>
      </div>
    </Modal>
  );
}
