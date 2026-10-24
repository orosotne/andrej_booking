import { SCHEDULE_2028_FROM, WEEKDAY } from "@/lib/calendar-date";
import { clinicDate, clinicTime, isoAddDays } from "@/lib/format";

// Dispenzárne sloty „nie pre nových pacientov" (zmena zavedená 2026-10-24).
//
// Štvrtkový a piatkový dispenzár s neskorým oknom je kapacita pre pacientov,
// ktorých už ambulancia vedie: do 31. 12. 2027 slot o 12:00 (štvrtok sa otvára
// 3 mesiace, piatok 1 mesiac pred termínom), od 1. 1. 2028 slot o 9:00
// (3 mesiace / 45 dní). Bez hesla doň možno objednať len pacienta, ktorý je
// v kategórii Pacienti zaregistrovaný aspoň NEW_PATIENT_DAYS dní. Úprava mena,
// telefónu, poznámky či roku narodenia registráciu neposúva — rozhoduje
// patients.created_at, nie updated_at.
//
// Slot sa určuje dátumom + časom začiatku (v čase ambulancie) + typom, rovnako
// ako PENTA: pravidlo tak prežije zmenu release okien v Nastaveniach a ide
// s určením slotu (preurčený 12:00 slot na akútne už obmedzený nie je).
// Modul je bez Prisma/Node závislostí — používa ho server aj klient.

export const NEW_PATIENT_DAYS = 10;

export const NEW_PATIENT_SLOT_MESSAGE =
  "TENTO SLOT NIE JE URČENÝ PRE NOVÝCH PACIENTOV";

/** Clinic wall-clock start of the established-patients slot on `dayIso`. */
function reservedStartFor(dayIso: string): string {
  return dayIso >= SCHEDULE_2028_FROM ? "09:00" : "12:00";
}

/**
 * True for the Thursday/Friday dispenzár slot reserved for established
 * patients: 12:00 until 2027, 9:00 from 2028.
 */
export function isEstablishedPatientSlot(slot: {
  appointmentType: string;
  startAt: Date | string;
}): boolean {
  if (slot.appointmentType !== "DISPENSARY") return false;
  const iso =
    typeof slot.startAt === "string" ? slot.startAt : slot.startAt.toISOString();
  const dayIso = clinicDate(iso);
  const dow = new Date(`${dayIso}T00:00:00.000Z`).getUTCDay();
  if (dow !== WEEKDAY.THU && dow !== WEEKDAY.FRI) return false;
  return clinicTime(iso) === reservedStartFor(dayIso);
}

/** Clinic date (YYYY-MM-DD) from which a patient registered at `createdAt` is no longer new. */
export function establishedFrom(createdAt: Date | string): string {
  const iso = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return isoAddDays(clinicDate(iso), NEW_PATIENT_DAYS);
}

/**
 * True while the patient still counts as new: registered fewer than
 * NEW_PATIENT_DAYS clinic calendar days ago. Registered on 14 Oct → new until
 * 23 Oct, established (bookable without a password) from 24 Oct.
 */
export function isNewPatient(createdAt: Date | string, now: Date = new Date()): boolean {
  return establishedFrom(createdAt) > clinicDate(now.toISOString());
}
