import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { profilePasswordSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { encryptReadablePassword } from "@/lib/auth/password-readable";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { ValidationError } from "@/lib/errors";

// Self-service password change for the logged-in user (doctor/nurse/admin).
// The current password is verified first; the new one updates the login hash
// and the admin-viewable encrypted copy. Admins keep oversight via the
// "naposledy zmena hesla" date and the reveal action in user management.
export const POST = defineRoute(
  { roles: ALL_STAFF, body: profilePasswordSchema },
  async ({ user, body, audit }) => {
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    if (!row || !row.passwordHash) {
      throw new ValidationError("Účet nemá nastavené heslo.");
    }

    const ok = await verifyPassword(row.passwordHash, body.currentPassword);
    if (!ok) throw new ValidationError("Súčasné heslo je nesprávne.");

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordReadable: encryptReadablePassword(body.newPassword),
          passwordChangedAt: new Date(),
        },
      });
      await recordAudit(tx, {
        entityType: "user",
        entityId: user.id,
        action: "password_change_self",
        ctx: audit,
      });
    });

    return NextResponse.json({ ok: true });
  },
);
