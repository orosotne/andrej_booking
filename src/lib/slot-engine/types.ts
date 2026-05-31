// Local string-union mirrors of Prisma enums. Values are identical to the
// Prisma enum members, so they map at the DB boundary with a plain cast.
// Keeping pure logic dependency-free lets the engine be unit-tested without
// a generated Prisma client or a database.

export type AppointmentTypeLit =
  | "PRE_HOSPITAL"
  | "CONSULTATION_BLOCKED"
  | "DISPENSARY"
  | "ECHO"
  | "ACUTE_RESERVE"
  | "CUSTOM";

export type SlotStatusLit =
  | "LOCKED"
  | "AVAILABLE"
  | "BOOKED"
  | "BLOCKED"
  | "CANCELLED"
  | "COMPLETED";

export type ReleaseTypeLit =
  | "IMMEDIATE"
  | "DAYS_BEFORE"
  | "MANUAL_ONLY"
  | "LAST_FRIDAY_30_DAYS_BEFORE";

export type ColorKey =
  | "pink" // PRE_HOSPITAL
  | "grey" // CONSULTATION_BLOCKED (poradňa)
  | "white" // DISPENSARY
  | "blue" // ECHO
  | "orange"; // ACUTE_RESERVE

export type ReleasePolicyInput =
  | { type: "IMMEDIATE" }
  | { type: "MANUAL_ONLY" }
  | { type: "DAYS_BEFORE"; daysBefore: number }
  | { type: "LAST_FRIDAY_30_DAYS_BEFORE" };
