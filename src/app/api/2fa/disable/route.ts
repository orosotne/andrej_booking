import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { totpCodeSchema } from "@/lib/validation";
import { verifyTotp } from "@/lib/auth/totp";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { ValidationError } from "@/lib/errors";

export const POST = defineRoute(
  { roles: ALL_STAFF, body: totpCodeSchema },
  async ({ body: { code }, user, audit }) => {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.totpSecret || !dbUser.twoFactorEnabled) {
      throw new ValidationError("2FA nie je zapnuté.");
    }
    if (!verifyTotp(dbUser.totpSecret, code)) {
      throw new ValidationError("Neplatný overovací kód.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: false, totpSecret: null },
      });
      await recordAudit(tx, {
        entityType: "user",
        entityId: user.id,
        action: "2fa_disable",
        ctx: audit,
      });
    });
    return NextResponse.json({ ok: true });
  },
);
