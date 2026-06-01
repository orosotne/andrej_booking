import { prisma } from "@/lib/db";

/**
 * Daily release job: opens every slot whose release time has arrived.
 * Covers ordinary DAYS_BEFORE rules and the last-Friday 30-days-before rule
 * (those slots simply carry a release_at 30 days before the date). Blocked
 * consultation slots and manual-only slots (release_at = null) are never opened.
 */
export async function releaseDueSlots(now: Date = new Date()): Promise<number> {
  const result = await prisma.appointmentSlot.updateMany({
    where: {
      status: "LOCKED",
      releaseAt: { not: null, lte: now },
      appointmentType: { notIn: ["CONSULTATION_BLOCKED", "ECHO_DEPARTMENT_BLOCKED"] },
    },
    data: { status: "AVAILABLE" },
  });
  return result.count;
}

/** Runs the full daily maintenance: generate ahead, then release due slots. */
export async function runDailyMaintenance(now: Date = new Date()) {
  const { generateForward } = await import("./generate");
  const generated = await generateForward({ now, months: 14 });
  const released = await releaseDueSlots(now);
  return { generated, released };
}
