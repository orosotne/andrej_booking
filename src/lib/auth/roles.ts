export type Role = "ADMIN" | "DOCTOR" | "NURSE";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  DOCTOR: "Lekár",
  NURSE: "Sestra",
};

export const ALL_STAFF: Role[] = ["ADMIN", "DOCTOR", "NURSE"];
export const ADMIN_ONLY: Role[] = ["ADMIN"];
export const DOCTOR_ADMIN: Role[] = ["ADMIN", "DOCTOR"];
