import { auth } from "./auth";
import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Role } from "./roles";

export { ALL_STAFF, ADMIN_ONLY, DOCTOR_ADMIN, type Role } from "./roles";

export interface SessionUser {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
}

/**
 * Resolves the signed-in user, re-validating against the DB on every call.
 *
 * The session is a JWT (valid up to 8h) that snapshots role + identity at
 * login. Without this check a deactivation, expiry or role change would only
 * take effect at the user's next login. We therefore re-read the authoritative
 * role/isActive/expiresAt from the database: a deactivated or expired account is
 * treated as signed-out, and the live role overrides the (possibly stale) token
 * role. One indexed primary-key lookup per request — negligible at clinic scale.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const tokenUser = (session?.user as SessionUser | undefined) ?? null;
  if (!tokenUser?.id) return null;

  const fresh = await prisma.user.findUnique({
    where: { id: tokenUser.id },
    select: { role: true, isActive: true, expiresAt: true },
  });
  if (!fresh || !fresh.isActive) return null;
  if (fresh.expiresAt && fresh.expiresAt <= new Date()) return null;

  return { ...tokenUser, role: fresh.role as Role };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throws ForbiddenError if the signed-in user lacks one of the allowed roles. */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}
