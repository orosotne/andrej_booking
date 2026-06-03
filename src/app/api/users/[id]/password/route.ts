import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { userPasswordSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";
import { generatePassphrase } from "@/lib/auth/passphrase";
import { CLEARED_LOCKOUT } from "@/lib/auth/lockout";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    // Body is optional: no body → generate a passphrase.
    const body = await req.json().catch(() => ({}));
    const { password: provided } = userPasswordSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("Používateľ neexistuje.");

    const password = provided ?? generatePassphrase();
    const passwordHash = await hashPassword(password);

    // Resetting the password also clears any failed-login lockout.
    await prisma.user.update({
      where: { id },
      data: { passwordHash, ...CLEARED_LOCKOUT },
    });
    await recordAudit(prisma, {
      entityType: "user",
      entityId: id,
      action: "password_reset",
      ctx: auditContext(req, actor.id),
    });

    // Return the plaintext only when the server generated it, so the admin can
    // relay it. An admin-chosen password is never echoed back.
    return NextResponse.json({ password: provided ? null : password });
  } catch (e) {
    return jsonError(e);
  }
}
