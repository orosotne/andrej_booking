import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { totpCodeSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";
import {
  generateTotpSecret,
  totpUri,
  verifyTotp,
  encryptTotpSecret,
  decryptTotpSecret,
} from "@/lib/auth/totp";
import { ValidationError } from "@/lib/errors";

// Generates a new TOTP secret and returns a QR for the authenticator app.
// 2FA is not active until verified via /api/2fa/enable.
export const POST = defineRoute({ roles: ALL_STAFF }, async ({ req, user }) => {
  const current = await prisma.user.findUnique({ where: { id: user.id } });

  // Step-up: if 2FA is already enabled, require a valid current code before
  // re-issuing a secret — otherwise a hijacked session could silently strip
  // 2FA (setup resets twoFactorEnabled to false). The setup UI only calls
  // this while 2FA is off, so the guard only affects direct API calls. Mirrors
  // the proof required by /api/2fa/disable.
  if (current?.twoFactorEnabled && current.totpSecret) {
    const { code } = totpCodeSchema.parse(await req.json().catch(() => ({})));
    if (!verifyTotp(decryptTotpSecret(current.totpSecret), code)) {
      throw new ValidationError("Neplatný overovací kód pre aktuálne 2FA.");
    }
  }

  const secret = generateTotpSecret();
  const dbUser = await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptTotpSecret(secret), twoFactorEnabled: false },
  });
  const uri = totpUri(dbUser.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return NextResponse.json({ secret, uri, qr });
});
