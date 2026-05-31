import { hash, verify } from "@node-rs/argon2";

// argon2id with sensible defaults (prebuilt binaries via @node-rs/argon2 — no node-gyp).
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return verify(hashed, plain);
}
