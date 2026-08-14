"use client";

import { useState } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { PatientSearch, type PatientLite } from "./PatientSearch";
import type { SlotDTO } from "@/lib/api-types";
import type { PatientCategoryLit } from "@/lib/slot-engine/types";
import { apiSend } from "@/lib/client";
import { TYPE_META } from "@/lib/slot-style";
import {
  clinicTime,
  clinicLongDate,
  clinicDayChip,
  todayIso,
  isoAddDays,
} from "@/lib/format";
import {
  PATIENT_CATEGORIES,
  PATIENT_CATEGORY_HELP,
  PATIENT_CATEGORY_LABEL,
  categoryAllowsSlot,
} from "@/lib/patient-category";

export function BookingDialog({
  slot,
  dayIso,
  isAdmin = false,
  onClose,
  onBooked,
}: {
  slot: SlotDTO;
  dayIso: string;
  isAdmin?: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { busy, run } = useAsyncAction();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [category, setCategory] = useState<PatientCategoryLit | null>(null);
  const [categoryReason, setCategoryReason] = useState("");
  const [note, setNote] = useState("");
  const [lockMode, setLockMode] = useState(false);
  const [lockPassword, setLockPassword] = useState("");
  // PASSWORD = zamknuté až do odomknutia heslom; DATE = v ráno zvoleného dňa
  // slot odomkne release cron sám.
  const [lockKind, setLockKind] = useState<"PASSWORD" | "DATE">("PASSWORD");
  const [lockUntil, setLockUntil] = useState("");
  const meta = TYPE_META[slot.appointmentType];

  const categoryFits = category
    ? categoryAllowsSlot(category, slot.appointmentType)
    : true;
  const needsReason = category === "INE";
  const canSubmit =
    !!patient &&
    !!category &&
    categoryFits &&
    (!needsReason || categoryReason.trim().length > 0);

  function confirm() {
    if (!patient || !category) return;
    run(
      () =>
        apiSend(`/api/slots/${slot.id}/book`, "POST", {
          patientId: patient.id,
          appointmentType: slot.appointmentType,
          patientCategory: category,
          categoryReason: needsReason ? categoryReason.trim() : undefined,
          note: note || undefined,
        }),
      {
        success: `Objednané: ${patient.lastName} ${patient.firstName}`,
        onDone: onBooked,
      },
    );
  }

  const canLock =
    !!lockPassword && (lockKind === "PASSWORD" || !!lockUntil);

  function lock() {
    if (!canLock) return;
    run(
      () =>
        apiSend(`/api/slots/${slot.id}/lock`, "POST", {
          password: lockPassword,
          until: lockKind === "DATE" ? lockUntil : undefined,
        }),
      {
        success:
          lockKind === "DATE"
            ? `Slot zamknutý do ${clinicDayChip(lockUntil)}`
            : "Slot zamknutý",
        onDone: onBooked,
      },
    );
  }

  return (
    <Modal
      title="Objednať pacienta"
      subtitle={`${clinicLongDate(dayIso)} · ${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)} · ${meta.label}`}
      onClose={onClose}
    >
      {!patient ? (
        <div className="space-y-3">
          <PatientSearch onSelect={setPatient} />
          {isAdmin && (
            <div className="border-t border-slate-100 pt-3">
              {lockMode ? (
                <div className="space-y-2">
                  <fieldset>
                    <legend className="text-sm font-medium text-slate-700">
                      Ako dlho má byť slot zamknutý?
                    </legend>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLockKind("PASSWORD")}
                        aria-pressed={lockKind === "PASSWORD"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 ${
                          lockKind === "PASSWORD"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-900 hover:border-slate-400"
                        }`}
                      >
                        <span className="block font-medium">Až do odomknutia heslom</span>
                        <span
                          className={`block text-[11px] leading-snug ${
                            lockKind === "PASSWORD" ? "text-white/70" : "text-slate-500"
                          }`}
                        >
                          Otvorí sa len ručne cez heslo
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLockKind("DATE")}
                        aria-pressed={lockKind === "DATE"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 ${
                          lockKind === "DATE"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-900 hover:border-slate-400"
                        }`}
                      >
                        <span className="block font-medium">Do dátumu</span>
                        <span
                          className={`block text-[11px] leading-snug ${
                            lockKind === "DATE" ? "text-white/70" : "text-slate-500"
                          }`}
                        >
                          V ten deň sa odomkne sám
                        </span>
                      </button>
                    </div>
                  </fieldset>
                  {lockKind === "DATE" && (
                    <>
                      <Field
                        label="Automaticky odomknúť dňa"
                        type="date"
                        required
                        min={isoAddDays(todayIso(), 1)}
                        max={dayIso}
                        value={lockUntil}
                        onChange={(e) => setLockUntil(e.target.value)}
                      />
                      {lockUntil && (
                        <p className="text-xs text-slate-500">
                          Slot sa automaticky odomkne ráno {clinicDayChip(lockUntil)}.
                        </p>
                      )}
                    </>
                  )}
                  <Field
                    label="Heslo na zamknutie slotu"
                    type="password"
                    required
                    autoFocus
                    value={lockPassword}
                    onChange={(e) => setLockPassword(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      fullWidth
                      onClick={() => {
                        setLockMode(false);
                        setLockPassword("");
                        setLockKind("PASSWORD");
                        setLockUntil("");
                      }}
                    >
                      Zrušiť
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      loading={busy}
                      disabled={!canLock}
                      onClick={lock}
                    >
                      <Lock className="h-4 w-4" />
                      Zamknúť slot
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => setLockMode(true)}
                >
                  <Lock className="h-4 w-4" />
                  Zamknúť slot (chrániť kapacitu)
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-900">
              {patient.lastName} {patient.firstName}
            </p>
            {patient.phone && (
              <p className="text-sm text-slate-500">{patient.phone}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setPatient(null);
                setCategory(null);
                setCategoryReason("");
              }}
              className="mt-1 text-xs text-slate-500 underline hover:text-slate-700"
            >
              Zmeniť pacienta
            </button>
          </div>

          <CategoryPicker
            value={category}
            slotType={slot.appointmentType}
            onChange={(c) => {
              setCategory(c);
              if (c !== "INE") setCategoryReason("");
            }}
          />

          {category && !categoryFits && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Pacient kategórie{" "}
                <strong>{PATIENT_CATEGORY_LABEL[category]}</strong> nepatrí do
                slotu <strong>{meta.label}</strong>.
              </span>
            </div>
          )}

          {needsReason && (
            <Field
              label="Dôvod (povinné pre Iné)"
              required
              value={categoryReason}
              onChange={(e) => setCategoryReason(e.target.value)}
              placeholder="Napríklad: kontrola po hospitalizácii"
            />
          )}

          <TextareaField
            label="Poznámka (voliteľné)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />

          <Button
            variant="success"
            fullWidth
            loading={busy}
            disabled={!canSubmit}
            onClick={confirm}
          >
            Potvrdiť objednávku
          </Button>
        </div>
      )}
    </Modal>
  );
}

function CategoryPicker({
  value,
  slotType,
  onChange,
}: {
  value: PatientCategoryLit | null;
  slotType: SlotDTO["appointmentType"];
  onChange: (c: PatientCategoryLit) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">
        Kategória pacienta <span className="text-rose-600">*</span>
      </legend>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PATIENT_CATEGORIES.map((c) => {
          const fits = categoryAllowsSlot(c, slotType);
          const selected = value === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-pressed={selected}
              className={[
                "rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30",
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : fits
                    ? "border-slate-300 bg-white text-slate-900 hover:border-slate-400"
                    : "border-slate-200 bg-slate-50 text-slate-400",
              ].join(" ")}
            >
              <span className="block font-medium">
                {PATIENT_CATEGORY_LABEL[c]}
              </span>
              <span
                className={[
                  "block text-[11px] leading-snug",
                  selected ? "text-white/70" : "text-slate-500",
                ].join(" ")}
              >
                {PATIENT_CATEGORY_HELP[c]}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
