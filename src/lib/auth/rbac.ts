import { auth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Role } from "./roles";

export { ALL_STAFF, ADMIN_ONLY, DOCTOR_ADMIN, type Role } from "./roles";

export interface SessionUser {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
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
