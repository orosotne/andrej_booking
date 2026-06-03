import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TOTP, Secret } from "otpauth";

const ISSUER = "Ambulancia";

// --- Encryption at rest for the TOTP secret -------------------------------
//
// Opt-in: when TOTP_ENC_KEY (base64 of 32 bytes, e.g. `openssl rand -base64 32`)
// is set, secrets are stored AES-256-GCM encrypted with the prefix "enc:v1:".
// When it is unset the secret is stored as-is (the prior behaviour), so enabling
// this is a no-op for existing deployments until a key is configured.
//
// decryptTotpSecret transparently handles both: a value without the "enc:v1:"
// prefix is returned unchanged (legacy plaintext / base32 — which can never start
// with that prefix), so previously-enrolled secrets keep verifying.
const ENC_PREFIX = "enc:v1:";

function encKey(): Buffer | null {
  const raw = process.env.TOTP_ENC_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENC_KEY must be base64 of exactly 32 bytes.");
  }
  return key;
}

export function encryptTotpSecret(plain: string): string {
  const key = encKey();
  if (!key) return plain; // no key configured → store as-is (legacy behaviour)
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptTotpSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  const key = encKey();
  if (!key) {
    throw new Error("TOTP_ENC_KEY is required to read an encrypted TOTP secret.");
  }
  const [ivB64, tagB64, ctB64] = stored.slice(ENC_PREFIX.length).split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return (
    decipher.update(Buffer.from(ctB64, "base64")).toString("utf8") +
    decipher.final("utf8")
  );
}

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
