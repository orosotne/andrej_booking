import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import { verifyTotp, decryptTotpSecret } from "./totp";
import { isLocked, nextFailureState, CLEARED_LOCKOUT } from "./lockout";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totp: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user || !user.isActive || !user.passwordHash) return null;

        // Temporary stand-in accounts expire: once expiresAt passes, login is
        // refused even though the row still exists (kept for the audit trail).
        if (user.expiresAt && user.expiresAt <= new Date()) return null;

        // Too many recent failures — reject without even checking the password.
        if (isLocked(user)) return null;

        const passwordOk = await verifyPassword(user.passwordHash, parsed.data.password);

        // Second factor: required only when the user has enabled 2FA. A missing
        // or wrong code counts as a failed attempt (login is single-step), so it
        // is also rate-limited against brute force.
        let secondFactorOk = true;
        if (passwordOk && user.twoFactorEnabled && user.totpSecret) {
          const code = parsed.data.totp ?? "";
          secondFactorOk =
            /^\d{6}$/.test(code) &&
            verifyTotp(decryptTotpSecret(user.totpSecret), code);
        }

        if (!passwordOk || !secondFactorOk) {
          await prisma.user.update({ where: { id: user.id }, data: nextFailureState(user) });
          return null;
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { ...CLEARED_LOCKOUT } });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
