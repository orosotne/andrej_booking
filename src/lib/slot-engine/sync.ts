import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { NotFoundError } from "@/lib/errors";
import {
  expandTemplateRules,
  diffDaySlots,
  type DesiredSlot,
  type ExistingSlot,
} from "./reconcile";

export interface SyncReport {
  dryRun: boolean;
  days: number; // future days of this weekday that were inspected
  created: number; // slots added
  deleted: number; // unbooked slots removed
  keptBooked: number; // booked slots dropped from the template but preserved
}

/**
 * Re-applies a schedule template to its already-generated FUTURE days, so that
 * adding/removing a block in the template propagates to existing days. Past
 * days are never touched. Booked slots are never deleted or modified — only
 * unbooked slots are added/removed. With `dryRun: true` nothing is written and
 * the report previews what would change.
 */
export async function syncTemplateToFutureDays(
  templateId: string,
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<SyncReport> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? new Date();
  const today = dateOnly(toIsoDate(now));

  const template = await prisma.scheduleTemplate.findUnique({
    where: { id: templateId },
    include: {
      slotRules: { include: { releasePolicy: true }, orderBy: { priority: "asc" } },
    },
  });
  if (!template) throw new NotFoundError("Šablóna neexistuje.");

  // date is @db.Date, so weekday isn't queryable — fetch future days and filter
  // to this template's weekday in JS. An active appointment = a non-cancelled,
  // non-rescheduled booking on the slot (mirrors the partial unique index).
  const days = await prisma.calendarDay.findMany({
    where: { date: { gte: today } },
    include: {
      slots: {
        select: {
          id: true,
          startAt: true,
          appointments: {
            where: { status: { notIn: ["CANCELLED", "RESCHEDULED"] } },
            select: { id: true },
          },
        },
      },
    },
  });
  const targetDays = days.filter((d) => d.date.getUTCDay() === template.dayOfWeek);

  const toCreate: (DesiredSlot & { calendarDayId: string })[] = [];
  const toDeleteIds: string[] = [];
  let keptBooked = 0;

  for (const day of targetDays) {
    const desired = expandTemplateRules(template.slotRules, day.date, now);
    const existing: ExistingSlot[] = day.slots.map((s) => ({
      id: s.id,
      startAt: s.startAt,
      hasActiveAppointment: s.appointments.length > 0,
    }));
    const diff = diffDaySlots(desired, existing);
    for (const c of diff.toCreate) toCreate.push({ ...c, calendarDayId: day.id });
    toDeleteIds.push(...diff.toDeleteIds);
    keptBooked += diff.keptBooked;
  }

  const report: SyncReport = {
    dryRun,
    days: targetDays.length,
    created: toCreate.length,
    deleted: toDeleteIds.length,
    keptBooked,
  };

  if (dryRun || (toCreate.length === 0 && toDeleteIds.length === 0)) return report;

  await prisma.$transaction(async (tx) => {
    if (toDeleteIds.length > 0) {
      await tx.appointmentSlot.deleteMany({ where: { id: { in: toDeleteIds } } });
    }
    if (toCreate.length > 0) {
      await tx.appointmentSlot.createMany({ data: toCreate, skipDuplicates: true });
    }
  });

  return report;
}
