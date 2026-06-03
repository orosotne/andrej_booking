import { hash, verify } from "@node-rs/argon2";

// Pinned to the OWASP-recommended cost parameters rather than relying on the
// library defaults (only 4 MiB / t=3). Argon2id is already the library's default
// algorithm, so it is left implicit. verify() reads the parameters embedded in
// each stored hash, so existing hashes keep verifying — only newly created
// hashes use these stronger settings. Prebuilt binaries via @node-rs/argon2.
const HASH_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, HASH_OPTIONS);
}

export function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return verify(hashed, plain);
}
