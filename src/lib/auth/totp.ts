import { TOTP, Secret } from "otpauth";

const ISSUER = "Ambulancia";

function buildTotp(label: string, base32: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: label || "user",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** otpauth:// URI for QR enrollment. */
export function totpUri(email: string, base32: string): string {
  return buildTotp(email, base32).toString();
}

/** Validates a 6-digit token against the secret (±1 step clock skew). */
export function verifyTotp(base32: string, token: string): boolean {
  return buildTotp("", base32).validate({ token, window: 1 }) !== null;
}
