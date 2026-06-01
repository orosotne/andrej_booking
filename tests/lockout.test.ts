import { describe, it, expect } from "vitest";
import {
  isLocked,
  nextFailureState,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
  ATTEMPT_WINDOW_MINUTES,
} from "@/lib/auth/lockout";

const now = new Date("2026-06-01T10:00:00.000Z");

describe("isLocked", () => {
  it("is not locked when lockedUntil is null", () => {
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
  });
  it("is locked when lockedUntil is in the future", () => {
    expect(isLocked({ lockedUntil: new Date(now.getTime() + 60_000) }, now)).toBe(true);
  });
  it("is not locked once lockedUntil has passed", () => {
    expect(isLocked({ lockedUntil: new Date(now.getTime() - 60_000) }, now)).toBe(false);
  });
});

describe("nextFailureState", () => {
  it("counts the first failure without locking", () => {
    const s = nextFailureState({ failedLoginAttempts: 0, lastFailedLoginAt: null }, now);
    expect(s.failedLoginAttempts).toBe(1);
    expect(s.lockedUntil).toBeNull();
    expect(s.lastFailedLoginAt).toEqual(now);
  });

  it("locks when attempts reach the max within the window", () => {
    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    const s = nextFailureState(
      { failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1, lastFailedLoginAt: oneMinuteAgo },
      now,
    );
    expect(s.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(s.lockedUntil).toEqual(new Date(now.getTime() + LOCKOUT_MINUTES * 60_000));
  });

  it("resets the streak when the last failure predates the window", () => {
    const stale = new Date(now.getTime() - (ATTEMPT_WINDOW_MINUTES + 1) * 60_000);
    const s = nextFailureState(
      { failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1, lastFailedLoginAt: stale },
      now,
    );
    expect(s.failedLoginAttempts).toBe(1);
    expect(s.lockedUntil).toBeNull();
  });

  it("keeps a fresh streak available after a lockout expires", () => {
    // The window must be shorter than the lockout, otherwise a single post-lock
    // failure would re-lock immediately.
    expect(LOCKOUT_MINUTES).toBeGreaterThan(ATTEMPT_WINDOW_MINUTES);
  });
});
