import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { decryptReadablePassword } from "@/lib/auth/password-readable";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";

// Reveals a user's current password to an admin (decrypted from the at-rest
// AES-GCM copy). ADMIN-only and audited — every view is recorded. Returns null
// when no readable copy exists (password predates the feature, or no key).
export const POST = defineRoute({ roles: ADMIN_ONLY }, async ({ params, audit }) => {
  const { id } = params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, passwordReadable: true },
  });
  if (!user) throw new NotFoundError("Používateľ neexistuje.");

  const password = decryptReadablePassword(user.passwordReadable);

  await prisma.$transaction((tx) =>
    recordAudit(tx, {
      entityType: "user",
      entityId: id,
      action: "password_view",
      ctx: audit,
    }),
  );

  return NextResponse.json({ password });
});
