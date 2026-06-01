import type {
  AppointmentTypeLit,
  PatientCategoryLit,
} from "./slot-engine/types";

export const PATIENT_CATEGORIES: readonly PatientCategoryLit[] = [
  "DISPENZAR",
  "ECHO",
  "PRVOVYSETRENIE",
  "AKUTNE",
  "INE",
];

export const PATIENT_CATEGORY_LABEL: Record<PatientCategoryLit, string> = {
  DISPENZAR: "Dispenzár",
  ECHO: "Echo",
  PRVOVYSETRENIE: "Prvovyšetrenie",
  AKUTNE: "Akútne",
  INE: "Iné",
};

export const PATIENT_CATEGORY_HELP: Record<PatientCategoryLit, string> = {
  DISPENZAR: "Iba do dispenzárneho slotu",
  ECHO: "Iba do ECHO slotu",
  PRVOVYSETRENIE: "Iba do dispenzárneho slotu",
  AKUTNE: "Akýkoľvek voľný slot",
  INE: "Akýkoľvek voľný slot (uveďte dôvod)",
};

/** Returns true if a patient with `category` may be booked into `slotType`. */
export function categoryAllowsSlot(
  category: PatientCategoryLit,
  slotType: AppointmentTypeLit,
): boolean {
  if (
    slotType === "CONSULTATION_BLOCKED" ||
    slotType === "ECHO_DEPARTMENT_BLOCKED"
  ) {
    return false;
  }
  switch (category) {
    case "DISPENZAR":
    case "PRVOVYSETRENIE":
      return slotType === "DISPENSARY";
    case "ECHO":
      return slotType === "ECHO";
    case "AKUTNE":
    case "INE":
      return (
        slotType === "DISPENSARY" ||
        slotType === "ECHO" ||
        slotType === "PRE_HOSPITAL" ||
        slotType === "ACUTE_RESERVE" ||
        slotType === "CUSTOM"
      );
  }
}
