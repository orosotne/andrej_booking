import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";
import { generateTotpSecret, totpUri } from "@/lib/auth/totp";

// Generates a new TOTP secret and returns a QR for the authenticator app.
// 2FA is not active until verified via /api/2fa/enable.
export async function POST() {
  try {
    const user = await requireUser();
    const secret = generateTotpSecret();
    const dbUser = await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, twoFactorEnabled: false },
    });
    const uri = totpUri(dbUser.email, secret);
    const qr = await QRCode.toDataURL(uri);
    return NextResponse.json({ secret, uri, qr });
  } catch (e) {
    return jsonError(e);
  }
}
