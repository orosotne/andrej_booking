import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The single definition of "a locked slot the cron will open at `now`".
 * Shared with the dashboard so its "najbližšie uvoľnenie" can never drift from
 * what releaseDueSlots actually opens.
 */
export function releasableWhere(now: Date): Prisma.AppointmentSlotWhereInput {
  return {
    status: "LOCKED",
    releaseAt: { not: null, lte: now },
    appointmentType: { notIn: ["CONSULTATION_BLOCKED", "ECHO_DEPARTMENT_BLOCKED"] },
  };
}

/** Same predicate, but for locks that have NOT come due yet (what's next). */
export function pendingReleaseWhere(now: Date): Prisma.AppointmentSlotWhereInput {
  return {
    status: "LOCKED",
    releaseAt: { gt: now },
    appointmentType: { notIn: ["CONSULTATION_BLOCKED", "ECHO_DEPARTMENT_BLOCKED"] },
  };
}

/**
 * Daily release job: opens every slot whose release time has arrived.
 * Covers ordinary DAYS_BEFORE rules, the last-Friday 30-days-before rule
 * (those slots simply carry a release_at 30 days before the date) and manual
 * locks with an auto-unlock date (lockSlot's `until` → release_at on that day).
 * Blocked consultation slots and slots locked until a password unlock
 * (release_at = null) are never opened. Releasing also clears the manual-lock
 * marker + reason, so an expired date-lock doesn't keep shielding the slot
 * from template re-applies or linger in the locked-slots admin list.
 */
export async function releaseDueSlots(now: Date = new Date()): Promise<number> {
  const result = await prisma.appointmentSlot.updateMany({
    where: releasableWhere(now),
    // typeOverride is deliberately NOT cleared: a hand-picked "určenie" is not
    // a lock, and clearing it would silently re-expose the slot to the next
    // template re-apply.
    data: { status: "AVAILABLE", manualLock: false, lockedReason: null },
  });
  return result.count;
}

/** Runs the full daily maintenance: generate ahead, close holidays, then release due slots. */
export async function runDailyMaintenance(now: Date = new Date()) {
  const { generateForward, closeHolidaysForward } = await import("./generate");
  const generated = await generateForward({ now, months: 14 });
  const holidaysClosed = await closeHolidaysForward({ now, months: 14 });
  const released = await releaseDueSlots(now);
  return { generated, holidaysClosed, released };
}
