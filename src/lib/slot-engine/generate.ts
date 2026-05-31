import { prisma } from "@/lib/db";
import {
  dateOnly,
  defaultDayType,
  isLastFridayOfMonth,
  toIsoDate,
  WEEKDAY,
  type DefaultDayType,
} from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { computeReleaseAt, initialSlotStatus } from "./release-rules";
import { hhmmToMin, minToHhmm, SLOT_MINUTES } from "./template";
import type { ReleasePolicyInput } from "./types";

interface PolicyRow {
  releaseType: string;
  daysBefore: number | null;
}

/** Maps a DB ReleasePolicy row to the pure engine's policy input. */
function toPolicyInput(policy: PolicyRow | null): ReleasePolicyInput {
  if (!policy) return { type: "MANUAL_ONLY" }; // no policy → stay locked (safe default)
  switch (policy.releaseType) {
    case "IMMEDIATE":
      return { type: "IMMEDIATE" };
    case "DAYS_BEFORE":
      return { type: "DAYS_BEFORE", daysBefore: policy.daysBefore ?? 0 };
    case "LAST_FRIDAY_30_DAYS_BEFORE":
      return { type: "LAST_FRIDAY_30_DAYS_BEFORE" };
    case "MANUAL_ONLY":
    default:
      return { type: "MANUAL_ONLY" };
  }
}

/** Expands a rule's [startTime, endTime] block into 30-minute sub-slots. */
function expandRule(startTime: string, endTime: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let m = hhmmToMin(startTime); m < hhmmToMin(endTime); m += SLOT_MINUTES) {
    out.push({ start: minToHhmm(m), end: minToHhmm(m + SLOT_MINUTES) });
  }
  return out;
}

export interface GenerateDayOptions {
  /** Overrides the computed day type (e.g. MANUAL_WEDNESDAY when opening a Wednesday). */
  dayType?: DefaultDayType;
  /** User who manually opened the day (sets status OPEN). */
  openedByUserId?: string;
  note?: string;
  now?: Date;
}

/**
 * Idempotently generates the calendar day + its slots from the active schedule
 * template. Slot release times come from each rule's policy; on the last Friday
 * of the month every non-blocked slot is overridden to the last-Friday policy.
 */
export async function generateDay(
  dateInput: Date | string,
  opts: GenerateDayOptions = {},
) {
  const date = typeof dateInput === "string" ? dateOnly(dateInput) : dateInput;
  const now = opts.now ?? new Date();
  const dow = date.getUTCDay();
  const lastFri = isLastFridayOfMonth(date);
  const dayType = opts.dayType ?? defaultDayType(date);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.calendarDay.findUnique({
      where: { date },
      include: { slots: { take: 1 } },
    });
    if (existing && existing.slots.length > 0) return existing; // already generated

    const template = await tx.scheduleTemplate.findFirst({
      where: { dayOfWeek: dow, isActive: true },
      include: {
        slotRules: {
          include: { releasePolicy: true },
          orderBy: { priority: "asc" },
        },
      },
    });
    if (!template) {
      throw new Error(`No active schedule template for weekday ${dow}`);
    }

    const opened = Boolean(opts.openedByUserId);
    const calendarDay = await tx.calendarDay.upsert({
      where: { date },
      create: {
        date,
        dayType,
        status: opened ? "OPEN" : "GENERATED",
        openedByUserId: opts.openedByUserId,
        openedAt: opened ? now : null,
        note: opts.note,
      },
      update: {
        dayType,
        status: opened ? "OPEN" : "GENERATED",
        openedByUserId: opts.openedByUserId,
        openedAt: opened ? now : undefined,
        note: opts.note,
      },
    });

    const data = template.slotRules.flatMap((rule) => {
      const policyInput: ReleasePolicyInput =
        lastFri && rule.appointmentType !== "CONSULTATION_BLOCKED"
          ? { type: "LAST_FRIDAY_30_DAYS_BEFORE" }
          : toPolicyInput(rule.releasePolicy);

      return expandRule(rule.startTime, rule.endTime).map((s) => {
        const releaseAt = computeReleaseAt(date, policyInput, lastFri);
        return {
          calendarDayId: calendarDay.id,
          startAt: wallClockToUtc(date, s.start),
          endAt: wallClockToUtc(date, s.end),
          appointmentType: rule.appointmentType,
          status: initialSlotStatus(rule.appointmentType, releaseAt, now),
          releaseAt,
          color: rule.color,
          ruleId: rule.id,
        };
      });
    });

    await tx.appointmentSlot.createMany({ data });

    return tx.calendarDay.findUniqueOrThrow({
      where: { id: calendarDay.id },
      include: { slots: { orderBy: { startAt: "asc" } } },
    });
  });
}

/**
 * Generates working days (Thu/Fri) that don't yet exist, up to `months` ahead.
 * Most slots stay LOCKED — release rules open them over time. Wednesdays are
 * intentionally never auto-generated (they are opened manually).
 */
export async function generateForward(opts: { months?: number; now?: Date } = {}) {
  const months = opts.months ?? 12;
  const now = opts.now ?? new Date();
  const start = dateOnly(toIsoDate(now));
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()),
  );

  // One query for the whole range instead of one findUnique per day.
  const existing = await prisma.calendarDay.findMany({
    where: { date: { gte: start, lte: end } },
    select: { date: true },
  });
  const existingIsos = new Set(existing.map((d) => toIsoDate(d.date)));

  let created = 0;
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  ) {
    const dow = d.getUTCDay();
    if (dow !== WEEKDAY.THU && dow !== WEEKDAY.FRI) continue;
    if (existingIsos.has(toIsoDate(d))) continue;

    await generateDay(new Date(d), { now });
    created++;
  }
  return created;
}
