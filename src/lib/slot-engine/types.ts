// Local string-union mirrors of Prisma enums. Values are identical to the
// Prisma enum members, so they map at the DB boundary with a plain cast.
// Keeping pure logic dependency-free lets the engine be unit-tested without
// a generated Prisma client or a database.

export type AppointmentTypeLit =
  | "PRE_HOSPITAL"
  | "CONSULTATION_BLOCKED"
  | "DISPENSARY"
  | "ECHO"
  | "ECHO_DEPARTMENT_BLOCKED"
  | "ACUTE_RESERVE"
  | "CUSTOM";

export type SlotStatusLit =
  | "LOCKED"
  | "AVAILABLE"
  | "BOOKED"
  | "BLOCKED"
  | "CANCELLED"
  | "COMPLETED";

export type AppointmentStatusLit =
  | "SCHEDULED"
  | "ARRIVED"
  | "NO_SHOW"
  | "CANCELLED"
  | "RESCHEDULED"
  | "COMPLETED";

export type ReleaseTypeLit =
  | "IMMEDIATE"
  | "DAYS_BEFORE"
  | "MANUAL_ONLY"
  | "LAST_FRIDAY_30_DAYS_BEFORE";

export type ColorKey =
  | "pink" // PRE_HOSPITAL
  | "grey" // CONSULTATION_BLOCKED (Porada)
  | "white" // DISPENSARY
  | "blue" // ECHO bookable
  | "navy" // ECHO_DEPARTMENT_BLOCKED
  | "orange"; // ACUTE_RESERVE (legacy)

export type PatientCategoryLit =
  | "DISPENZAR"
  | "ECHO"
  | "PRVOVYSETRENIE"
  | "AKUTNE"
  | "INE";

export type ReleasePolicyInput =
  | { type: "IMMEDIATE" }
  | { type: "MANUAL_ONLY" }
  | { type: "DAYS_BEFORE"; daysBefore: number }
  | { type: "LAST_FRIDAY_30_DAYS_BEFORE" };
