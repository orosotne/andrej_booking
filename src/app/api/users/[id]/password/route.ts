import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { userPasswordSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";
import { encryptReadablePassword } from "@/lib/auth/password-readable";
import { generatePassphrase } from "@/lib/auth/passphrase";
import { CLEARED_LOCKOUT } from "@/lib/auth/lockout";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";

// Body is optional: no body → generate a passphrase.
export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: userPasswordSchema },
  async ({ params, body: { password: provided }, audit }) => {
    const { id } = params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("Používateľ neexistuje.");

    const password = provided ?? generatePassphrase();
    const passwordHash = await hashPassword(password);

    // Resetting the password also clears any failed-login lockout.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordReadable: encryptReadablePassword(password),
          passwordChangedAt: new Date(),
          ...CLEARED_LOCKOUT,
        },
      });
      await recordAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "password_reset",
        ctx: audit,
      });
    });

    // Return the plaintext only when the server generated it, so the admin can
    // relay it. An admin-chosen password is never echoed back.
    return NextResponse.json({ password: provided ? null : password });
  },
);
