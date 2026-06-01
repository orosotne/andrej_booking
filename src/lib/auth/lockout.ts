// Brute-force protection for credential login. The state lives on the User row
// (not an in-process counter) so it stays consistent across serverless
// instances — Vercel runs the auth handler in many short-lived lambdas, and a
// module-level Map would never accumulate. Pure logic here; persistence in auth.ts.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const ATTEMPT_WINDOW_MINUTES = 5;

type FailureInput = {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date | null;
};

export type LockoutUpdate = {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date;
  lockedUntil: Date | null;
};

export function isLocked(user: { lockedUntil: Date | null }, now: Date = new Date()): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}

// State to persist after one more failed attempt. Failures older than the
// sliding window don't count, so a fresh streak begins once a lockout expires
// (guaranteed because LOCKOUT_MINUTES > ATTEMPT_WINDOW_MINUTES).
export function nextFailureState(prev: FailureInput, now: Date = new Date()): LockoutUpdate {
  const windowMs = ATTEMPT_WINDOW_MINUTES * 60_000;
  const withinWindow =
    prev.lastFailedLoginAt !== null &&
    now.getTime() - prev.lastFailedLoginAt.getTime() <= windowMs;
  const failedLoginAttempts = (withinWindow ? prev.failedLoginAttempts : 0) + 1;
  const lockedUntil =
    failedLoginAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
      : null;
  return { failedLoginAttempts, lastFailedLoginAt: now, lockedUntil };
}

// Cleared on a successful login.
export const CLEARED_LOCKOUT = {
  failedLoginAttempts: 0,
  lastFailedLoginAt: null,
  lockedUntil: null,
} as const;
