import { describe, it, expect, afterEach } from "vitest";
import { encryptTotpSecret, decryptTotpSecret } from "@/lib/auth/totp";

// A real base32 TOTP secret never starts with the "enc:v1:" prefix, so legacy
// plaintext is always passed through untouched.
const PLAINTEXT_SECRET = "JBSWY3DPEHPK3PXP";
const KEY = Buffer.alloc(32, 7).toString("base64"); // 32 bytes, base64

afterEach(() => {
  delete process.env.TOTP_ENC_KEY;
});

describe("TOTP secret encryption at rest", () => {
  it("stores plaintext unchanged when no key is configured", () => {
    delete process.env.TOTP_ENC_KEY;
    expect(encryptTotpSecret(PLAINTEXT_SECRET)).toBe(PLAINTEXT_SECRET);
  });

  it("decrypts a legacy (unencrypted) secret unchanged", () => {
    process.env.TOTP_ENC_KEY = KEY;
    expect(decryptTotpSecret(PLAINTEXT_SECRET)).toBe(PLAINTEXT_SECRET);
  });

  it("round-trips encrypt → decrypt with a key", () => {
    process.env.TOTP_ENC_KEY = KEY;
    const enc = encryptTotpSecret(PLAINTEXT_SECRET);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain(PLAINTEXT_SECRET);
    expect(decryptTotpSecret(enc)).toBe(PLAINTEXT_SECRET);
  });

  it("produces a fresh IV per call (ciphertext differs)", () => {
    process.env.TOTP_ENC_KEY = KEY;
    expect(encryptTotpSecret(PLAINTEXT_SECRET)).not.toBe(
      encryptTotpSecret(PLAINTEXT_SECRET),
    );
  });

  it("rejects a malformed key", () => {
    process.env.TOTP_ENC_KEY = "too-short";
    expect(() => encryptTotpSecret(PLAINTEXT_SECRET)).toThrow();
  });
});
