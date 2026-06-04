import type { User } from "@/generated/prisma/client";
import type { AdminUserDTO } from "@/lib/api-types";

// Fields safe to list / return. Deliberately never selects passwordHash or
// totpSecret so they cannot leak through the admin API.
export const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  expiresAt: true,
  twoFactorEnabled: true,
  createdAt: true,
  passwordChangedAt: true,
} as const;

type AdminUserRow = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "role"
  | "isActive"
  | "expiresAt"
  | "twoFactorEnabled"
  | "createdAt"
  | "passwordChangedAt"
>;

export function toAdminUserDTO(u: AdminUserRow): AdminUserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as AdminUserDTO["role"],
    isActive: u.isActive,
    expiresAt: u.expiresAt ? u.expiresAt.toISOString().slice(0, 10) : null,
    twoFactorEnabled: u.twoFactorEnabled,
    createdAt: u.createdAt.toISOString(),
    passwordChangedAt: u.passwordChangedAt
      ? u.passwordChangedAt.toISOString()
      : null,
  };
}

// Redacted snapshot for audit before/after — keeps the management-relevant
// fields an admin can change, never the password hash or TOTP secret.
export function auditUserSnapshot(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    expiresAt: u.expiresAt,
    twoFactorEnabled: u.twoFactorEnabled,
  };
}

// A date-only string (YYYY-MM-DD) becomes the end of that day, so a temporary
// account stays valid through the whole chosen day before login is refused.
export function expiryEndOfDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}
