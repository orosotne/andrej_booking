import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { totpCodeSchema } from "@/lib/validation";
import { verifyTotp } from "@/lib/auth/totp";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { ValidationError } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { code } = totpCodeSchema.parse(await req.json());

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.totpSecret) {
      throw new ValidationError("Najprv spustite nastavenie 2FA.");
    }
    if (!verifyTotp(dbUser.totpSecret, code)) {
      throw new ValidationError("Neplatný overovací kód.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });
    await recordAudit(prisma, {
      entityType: "user",
      entityId: user.id,
      action: "2fa_enable",
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
