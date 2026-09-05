// Symbol objednávky: tvar = ako dlho dopredu bola objednávka vytvorená,
// farba = kategória pacienta (akútne / dispenzár / echo). Zdieľané kartou
// slotu, zoznamom pacientov a detailom pacienta.
import type {
  AppointmentTypeLit,
  PatientCategoryLit,
} from "./slot-engine/types";

export type BookingShape = "full" | "half" | "quarter";
export type BookingColor = "red" | "green" | "blue" | "gray";

const DAY_MS = 86_400_000;

/** Whole days between the booking's creation and the slot start. */
export function leadTimeDays(createdAtIso: string, startAtIso: string): number {
  return Math.max(
    0,
    Math.floor((Date.parse(startAtIso) - Date.parse(createdAtIso)) / DAY_MS),
  );
}

/** > 250 days → full circle, 100–250 → half, < 100 → quarter. */
export function bookingShape(days: number): BookingShape {
  if (days > 250) return "full";
  if (days >= 100) return "half";
  return "quarter";
}

/**
 * Colour by patient category; older bookings without a category (and "Iné")
 * fall back to the slot type.
 */
export function bookingColor(
  category: string | null | undefined,
  slotType: string,
): BookingColor {
  switch (category as PatientCategoryLit | null | undefined) {
    case "AKUTNE":
      return "red";
    case "DISPENZAR":
    case "PRVOVYSETRENIE":
      return "green";
    case "ECHO":
      return "blue";
  }
  switch (slotType as AppointmentTypeLit) {
    case "PRE_HOSPITAL":
    case "ACUTE_RESERVE":
      return "red";
    case "DISPENSARY":
      return "green";
    case "ECHO":
      return "blue";
    default:
      return "gray";
  }
}

/** Two-digit birth year ("46", "82"); from birthYear, else the rodné číslo. */
export function birthYearShort(
  birthYear: number | null | undefined,
  nationalId: string | null | undefined,
): string | null {
  if (birthYear) return String(birthYear % 100).padStart(2, "0");
  const m = nationalId?.match(/^\s*(\d{2})/);
  return m ? m[1] : null;
}
