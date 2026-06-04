import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Admin-viewable copy of a user's password, encrypted at rest (NEVER plaintext).
//
// The clinic admin asked to be able to read the password a doctor/nurse set for
// themselves. The login hash (argon2) is one-way, so this is a second, separate
// copy — AES-256-GCM encrypted with PASSWORD_ENC_KEY (base64 of 32 bytes,
// `openssl rand -base64 32`). A DB or backup leak alone cannot reveal passwords:
// the key lives only in the environment. Viewing is ADMIN-only and audited.
//
// When PASSWORD_ENC_KEY is unset the feature is simply off: encrypt returns null
// (column stays empty) and decrypt returns null (UI shows "unknown").
const ENC_PREFIX = "enc:v1:";

function encKey(): Buffer | null {
  const raw = process.env.PASSWORD_ENC_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PASSWORD_ENC_KEY must be base64 of exactly 32 bytes.");
  }
  return key;
}

export function encryptReadablePassword(plain: string): string | null {
  const key = encKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Returns the plaintext, or null if no copy is stored / no key / unreadable. */
export function decryptReadablePassword(stored: string | null): string | null {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return null;
  const key = encKey();
  if (!key) return null;
  try {
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
  } catch {
    return null;
  }
}
