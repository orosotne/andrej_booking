import { prisma } from "@/lib/db";
import {
  dateOnly,
  defaultDayType,
  isLastFridayOfMonth,
  toIsoDate,
  WEEKDAY,
  type DefaultDayType,
} from "@/lib/calendar-date";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { holidayName, holidaysBetween } from "@/lib/holidays-sk";
import { partitionReopenSlots } from "./release-rules";
import { expandTemplateRules } from "./reconcile";

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
    // Automaticky generovaný (nie manuálne otvorený) deň, ktorý pripadá na
    // slovenský sviatok, vznikne rovno zatvorený — sloty sa neuvoľnia a deň sa
    // neponúka ako termín. Manuálne otvorenie (openedByUserId) má prednosť.
    const holiday = opened ? null : holidayName(toIsoDate(date));
    const isHolidayClose = holiday !== null;
    const status = isHolidayClose ? "CLOSED" : opened ? "OPEN" : "GENERATED";
    const note = opts.note ?? (isHolidayClose ? `Sviatok: ${holiday}` : undefined);

    const calendarDay = await tx.calendarDay.upsert({
      where: { date },
      create: {
        date,
        dayType,
        status,
        openedByUserId: opts.openedByUserId,
        openedAt: opened ? now : null,
        note,
      },
      update: {
        dayType,
        status,
        openedByUserId: opts.openedByUserId,
        openedAt: opened ? now : undefined,
        note,
      },
    });

    const data = expandTemplateRules(template.slotRules, date, now).map((s) => ({
      ...s,
      status: isHolidayClose ? ("BLOCKED" as const) : s.status,
      calendarDayId: calendarDay.id,
    }));

    await tx.appointmentSlot.createMany({ data });

    return tx.calendarDay.findUniqueOrThrow({
      where: { id: calendarDay.id },
      include: { slots: { orderBy: { startAt: "asc" } } },
    });
  });
}

/**
 * Reverses a close: a CLOSED day returns to GENERATED and every slot the close
 * blocked is recomputed to its natural status (AVAILABLE once released, else
 * LOCKED). Consultation blocks stay BLOCKED and kept appointments are untouched.
 */
export async function reopenDay(
  dateInput: Date | string,
  opts: { now?: Date } = {},
) {
  const date = typeof dateInput === "string" ? dateOnly(dateInput) : dateInput;
  const now = opts.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const day = await tx.calendarDay.findUnique({
      where: { date },
      include: { slots: true },
    });
    if (!day) throw new NotFoundError("Deň neexistuje.");
    if (day.status !== "CLOSED") throw new ConflictError("Deň nie je zatvorený.");

    const { toAvailable, toLocked } = partitionReopenSlots(day.slots, now);
    if (toAvailable.length > 0) {
      await tx.appointmentSlot.updateMany({
        where: { id: { in: toAvailable } },
        data: { status: "AVAILABLE" },
      });
    }
    if (toLocked.length > 0) {
      await tx.appointmentSlot.updateMany({
        where: { id: { in: toLocked } },
        data: { status: "LOCKED" },
      });
    }

    return tx.calendarDay.update({
      where: { id: day.id },
      data: { status: "GENERATED" },
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
  const months = opts.months ?? 14;
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
    // Last Friday of the month is password-gated: must be opened manually like a Wednesday.
    if (dow === WEEKDAY.FRI && isLastFridayOfMonth(d)) continue;
    if (existingIsos.has(toIsoDate(d))) continue;

    await generateDay(new Date(d), { now });
    created++;
  }
  return created;
}

/**
 * Closes Slovak public-holiday days within the horizon that are still open and
 * haven't been processed yet (`note` is null). One-shot per day: a day already
 * stamped with a holiday note is skipped, so a deliberate admin reopen is never
 * overridden on the next run. Existing appointments are preserved (only
 * AVAILABLE/LOCKED slots are blocked). Days generated from now on are already
 * created closed by generateDay — this backfills days that predate that.
 */
export async function closeHolidaysForward(
  opts: { months?: number; now?: Date } = {},
) {
  const months = opts.months ?? 14;
  const now = opts.now ?? new Date();
  const start = dateOnly(toIsoDate(now));
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()),
  );

  const holidays = holidaysBetween(toIsoDate(start), toIsoDate(end));
  if (holidays.length === 0) return 0;

  const days = await prisma.calendarDay.findMany({
    where: {
      date: { in: holidays.map((h) => dateOnly(h.iso)) },
      note: null,
      status: { not: "CLOSED" },
    },
    select: { id: true, date: true },
  });
  if (days.length === 0) return 0;

  const nameByIso = new Map(holidays.map((h) => [h.iso, h.name]));
  let closed = 0;
  for (const day of days) {
    const name = nameByIso.get(toIsoDate(day.date)) ?? "sviatok";
    await prisma.$transaction([
      prisma.appointmentSlot.updateMany({
        where: { calendarDayId: day.id, status: { in: ["AVAILABLE", "LOCKED"] } },
        data: { status: "BLOCKED" },
      }),
      prisma.calendarDay.update({
        where: { id: day.id },
        data: { status: "CLOSED", note: `Sviatok: ${name}` },
      }),
    ]);
    closed++;
  }
  return closed;
}
