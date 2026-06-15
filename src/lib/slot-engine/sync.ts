import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { NotFoundError } from "@/lib/errors";
import {
  expandTemplateRules,
  diffDaySlots,
  type DesiredSlot,
  type ExistingSlot,
  type SlotUpdate,
} from "./reconcile";
import type { AppointmentTypeLit, SlotStatusLit } from "./types";

export interface SyncReport {
  dryRun: boolean;
  days: number; // future days of this weekday that were inspected
  created: number; // slots added
  updated: number; // unbooked slots whose attributes were refreshed in place
  deleted: number; // unbooked slots removed
  keptBooked: number; // booked slots dropped from the template but preserved
}

/** Groups per-slot updates by their target so identical changes batch into one
 * updateMany — same idea as adjust-release-policies.ts. */
function bucketUpdates(updates: SlotUpdate[]) {
  const buckets = new Map<
    string,
    {
      ids: string[];
      appointmentType: AppointmentTypeLit;
      color: string;
      status: SlotStatusLit;
      releaseAt: Date | null;
    }
  >();
  for (const u of updates) {
    const key = `${u.appointmentType}|${u.color}|${u.status}|${u.releaseAt?.getTime() ?? "null"}`;
    const b =
      buckets.get(key) ??
      {
        ids: [],
        appointmentType: u.appointmentType,
        color: u.color,
        status: u.status,
        releaseAt: u.releaseAt,
      };
    b.ids.push(u.id);
    buckets.set(key, b);
  }
  return buckets;
}

/**
 * Re-applies a schedule template to its already-generated FUTURE days, so that
 * editing the template propagates to existing days. Past days are never touched.
 * Booked and manually-locked slots are never deleted or modified — only free
 * (AVAILABLE/LOCKED, unbooked) slots are added, removed, or refreshed in place
 * when their block's time-window / type / release rule changed. With
 * `dryRun: true` nothing is written and the report previews what would change.
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
          status: true,
          releaseAt: true,
          appointmentType: true,
          color: true,
          manualLock: true,
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
  const toUpdate: SlotUpdate[] = [];
  const toDeleteIds: string[] = [];
  let keptBooked = 0;

  for (const day of targetDays) {
    const desired = expandTemplateRules(template.slotRules, day.date, now);
    const existing: ExistingSlot[] = day.slots.map((s) => ({
      id: s.id,
      startAt: s.startAt,
      hasActiveAppointment: s.appointments.length > 0,
      manualLock: s.manualLock,
      appointmentType: s.appointmentType as AppointmentTypeLit,
      status: s.status as SlotStatusLit,
      releaseAt: s.releaseAt,
      color: s.color,
    }));
    const diff = diffDaySlots(desired, existing);
    for (const c of diff.toCreate) toCreate.push({ ...c, calendarDayId: day.id });
    toUpdate.push(...diff.toUpdate);
    toDeleteIds.push(...diff.toDeleteIds);
    keptBooked += diff.keptBooked;
  }

  const report: SyncReport = {
    dryRun,
    days: targetDays.length,
    created: toCreate.length,
    updated: toUpdate.length,
    deleted: toDeleteIds.length,
    keptBooked,
  };

  if (
    dryRun ||
    (toCreate.length === 0 && toUpdate.length === 0 && toDeleteIds.length === 0)
  )
    return report;

  await prisma.$transaction(async (tx) => {
    if (toDeleteIds.length > 0) {
      await tx.appointmentSlot.deleteMany({ where: { id: { in: toDeleteIds } } });
    }
    if (toCreate.length > 0) {
      await tx.appointmentSlot.createMany({ data: toCreate, skipDuplicates: true });
    }
    for (const b of bucketUpdates(toUpdate).values()) {
      await tx.appointmentSlot.updateMany({
        where: { id: { in: b.ids } },
        data: {
          appointmentType: b.appointmentType,
          color: b.color,
          status: b.status,
          releaseAt: b.releaseAt,
        },
      });
    }
  });

  return report;
}
