export type Role = "ADMIN" | "DOCTOR" | "NURSE";

export const ALL_STAFF: Role[] = ["ADMIN", "DOCTOR", "NURSE"];
export const ADMIN_ONLY: Role[] = ["ADMIN"];
export const DOCTOR_ADMIN: Role[] = ["ADMIN", "DOCTOR"];
