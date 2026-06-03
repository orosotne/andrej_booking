import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { partitionReopenSlots } from "@/lib/slot-engine/release-rules";
import { recordAudit, type AuditContext } from "@/lib/audit/audit";
import { ValidationError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

// "2026-06-04" → "4. 6." for a compact, Slovak-readable conflict list.
function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

/**
 * Refuses the operation if any day in [gte, lte] still holds a booked
 * appointment. The doctor must reschedule those patients first — a vacation is
 * never laid over existing bookings.
 */
async function assertNoBookings(tx: Tx, gte: Date, lte: Date) {
  const booked = await tx.appointmentSlot.findMany({
    where: { status: "BOOKED", calendarDay: { date: { gte, lte } } },
    select: { calendarDay: { select: { date: true } } },
    orderBy: { startAt: "asc" },
  });
  if (booked.length === 0) return;
  const dates = [
    ...new Set(booked.map((b) => b.calendarDay.date.toISOString().slice(0, 10))),
  ];
  const shown = dates.slice(0, 8).map(shortDay).join(", ");
  const more = dates.length > 8 ? " a ďalšie" : "";
  throw new ValidationError(
    `V rozsahu sú objednaní pacienti (${booked.length}) v dňoch: ${shown}${more}. ` +
      `Najprv ich presuňte na iný termín, až potom sa dá dovolenka naplánovať.`,
  );
}

/**
 * Closes every still-open working day in [gte, lte] and attributes it to the
 * vacation: day → CLOSED, its free (AVAILABLE/LOCKED) slots → BLOCKED. Days
 * already closed (holiday / manual / another vacation) are left untouched.
 */
async function closeRangeForVacation(
  tx: Tx,
  gte: Date,
  lte: Date,
  vacationId: string,
) {
  const days = await tx.calendarDay.findMany({
    where: { date: { gte, lte }, status: { not: "CLOSED" } },
    select: { id: true },
  });
  const ids = days.map((d) => d.id);
  if (ids.length === 0) return;
  await tx.appointmentSlot.updateMany({
    where: { calendarDayId: { in: ids }, status: { in: ["AVAILABLE", "LOCKED"] } },
    data: { status: "BLOCKED" },
  });
  await tx.calendarDay.updateMany({
    where: { id: { in: ids } },
    data: { status: "CLOSED", closedByVacationId: vacationId },
  });
}

/**
 * Reopens every day this vacation owns: BLOCKED slots recompute to their natural
 * AVAILABLE/LOCKED status (booked/rule-blocked untouched), day → GENERATED, and
 * the ownership marker is cleared.
 */
async function reopenOwnedDays(tx: Tx, vacationId: string, now: Date) {
  const days = await tx.calendarDay.findMany({
    where: { closedByVacationId: vacationId },
    include: { slots: true },
  });
  for (const day of days) {
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
  }
  await tx.calendarDay.updateMany({
    where: { closedByVacationId: vacationId },
    data: { status: "GENERATED", closedByVacationId: null },
  });
}

export function listVacations(year?: number) {
  const where: Prisma.VacationWhereInput =
    year === undefined
      ? {}
      : {
          startDate: { lte: dateOnly(`${year}-12-31`) },
          endDate: { gte: dateOnly(`${year}-01-01`) },
        };
  return prisma.vacation.findMany({ where, orderBy: { startDate: "asc" } });
}

export interface VacationInput {
  from: string;
  to: string;
  reason?: string;
  ctx: AuditContext;
}

export async function createVacation(input: VacationInput) {
  const gte = dateOnly(input.from);
  const lte = dateOnly(input.to);
  return prisma.$transaction(async (tx) => {
    await assertNoBookings(tx, gte, lte);
    const vacation = await tx.vacation.create({
      data: {
        startDate: gte,
        endDate: lte,
        reason: input.reason ?? null,
        createdByUserId: input.ctx.actorUserId ?? null,
      },
    });
    await closeRangeForVacation(tx, gte, lte, vacation.id);
    await recordAudit(tx, {
      entityType: "vacation",
      entityId: vacation.id,
      action: "create",
      reason: input.reason ?? null,
      after: { from: input.from, to: input.to },
      ctx: input.ctx,
    });
    return vacation;
  });
}

export async function updateVacation(input: VacationInput & { id: string }) {
  const gte = dateOnly(input.from);
  const lte = dateOnly(input.to);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.vacation.findUnique({ where: { id: input.id } });
    if (!existing) throw new NotFoundError("Dovolenka neexistuje.");
    // Release everything this vacation currently holds, then re-close the new
    // range — so removed days reopen and added days get blocked. The booking
    // guard runs on the new range; reopened days never carry bookings.
    await reopenOwnedDays(tx, input.id, now);
    await assertNoBookings(tx, gte, lte);
    await closeRangeForVacation(tx, gte, lte, input.id);
    const vacation = await tx.vacation.update({
      where: { id: input.id },
      data: { startDate: gte, endDate: lte, reason: input.reason ?? null },
    });
    await recordAudit(tx, {
      entityType: "vacation",
      entityId: input.id,
      action: "update",
      reason: input.reason ?? null,
      before: {
        from: toIsoDate(existing.startDate),
        to: toIsoDate(existing.endDate),
      },
      after: { from: input.from, to: input.to },
      ctx: input.ctx,
    });
    return vacation;
  });
}

export async function deleteVacation(input: { id: string; ctx: AuditContext }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.vacation.findUnique({ where: { id: input.id } });
    if (!existing) throw new NotFoundError("Dovolenka neexistuje.");
    await reopenOwnedDays(tx, input.id, now);
    await recordAudit(tx, {
      entityType: "vacation",
      entityId: input.id,
      action: "delete",
      before: {
        from: toIsoDate(existing.startDate),
        to: toIsoDate(existing.endDate),
      },
      ctx: input.ctx,
    });
    await tx.vacation.delete({ where: { id: input.id } });
    return existing;
  });
}
