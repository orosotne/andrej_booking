import { prisma } from "@/lib/db";
import { recordAudit, type AuditContext } from "@/lib/audit/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { AppointmentTypeLit } from "@/lib/slot-engine/types";

/** When a slot is freed, return it to AVAILABLE only if its release window is open. */
function statusAfterFreeing(
  releaseAt: Date | null,
  now: Date,
): "AVAILABLE" | "LOCKED" {
  return releaseAt !== null && releaseAt.getTime() <= now.getTime()
    ? "AVAILABLE"
    : "LOCKED";
}

export interface BookInput {
  slotId: string;
  patientId: string;
  appointmentType: AppointmentTypeLit;
  note?: string;
  ctx: AuditContext;
}

/**
 * Books a patient into a slot. Race-free: an atomic conditional UPDATE
 * (AVAILABLE → BOOKED) is the optimistic lock; if it doesn't flip exactly one
 * row, the slot was already taken/locked. The appointment-type guard runs
 * inside the transaction so a mismatch rolls the slot back to AVAILABLE.
 */
export async function bookSlot(input: BookInput) {
  return prisma.$transaction(async (tx) => {
    const lock = await tx.appointmentSlot.updateMany({
      where: { id: input.slotId, status: "AVAILABLE" },
      data: { status: "BOOKED" },
    });
    if (lock.count !== 1) {
      throw new ConflictError(
        "Slot nie je dostupný — je už obsadený, zamknutý alebo neexistuje.",
      );
    }

    const slot = await tx.appointmentSlot.findUniqueOrThrow({
      where: { id: input.slotId },
    });
    if (slot.appointmentType !== input.appointmentType) {
      throw new ValidationError(
        `Do tohto slotu (${slot.appointmentType}) nemožno objednať typ ${input.appointmentType}.`,
      );
    }

    const appointment = await tx.appointment.create({
      data: {
        slotId: slot.id,
        patientId: input.patientId,
        appointmentType: slot.appointmentType,
        status: "SCHEDULED",
        note: input.note ?? null,
        createdByUserId: input.ctx.actorUserId ?? null,
        updatedByUserId: input.ctx.actorUserId ?? null,
      },
    });

    await recordAudit(tx, {
      entityType: "appointment",
      entityId: appointment.id,
      action: "create",
      after: appointment,
      ctx: input.ctx,
    });
    return appointment;
  });
}

export interface CancelInput {
  appointmentId: string;
  reason: string;
  ctx: AuditContext;
  now?: Date;
}

export async function cancelAppointment(input: CancelInput) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      include: { slot: true },
    });
    if (!appointment) throw new NotFoundError("Objednávka neexistuje.");
    if (appointment.status === "CANCELLED") {
      throw new ConflictError("Objednávka je už zrušená.");
    }

    const updated = await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "CANCELLED",
        cancellationReason: input.reason,
        updatedByUserId: input.ctx.actorUserId ?? null,
      },
    });
    await tx.appointmentSlot.update({
      where: { id: appointment.slotId },
      data: { status: statusAfterFreeing(appointment.slot.releaseAt, now) },
    });

    await recordAudit(tx, {
      entityType: "appointment",
      entityId: appointment.id,
      action: "cancel",
      before: appointment,
      after: updated,
      reason: input.reason,
      ctx: input.ctx,
    });
    return updated;
  });
}

export interface RescheduleInput {
  appointmentId: string;
  newSlotId: string;
  reason?: string;
  ctx: AuditContext;
  now?: Date;
}

export async function rescheduleAppointment(input: RescheduleInput) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      include: { slot: true },
    });
    if (!appointment) throw new NotFoundError("Objednávka neexistuje.");
    if (["CANCELLED", "RESCHEDULED", "COMPLETED"].includes(appointment.status)) {
      throw new ConflictError("Túto objednávku nemožno presunúť.");
    }
    if (input.newSlotId === appointment.slotId) {
      throw new ValidationError("Nový slot je rovnaký ako pôvodný.");
    }

    const lock = await tx.appointmentSlot.updateMany({
      where: { id: input.newSlotId, status: "AVAILABLE" },
      data: { status: "BOOKED" },
    });
    if (lock.count !== 1) {
      throw new ConflictError("Cieľový slot nie je dostupný.");
    }

    const newSlot = await tx.appointmentSlot.findUniqueOrThrow({
      where: { id: input.newSlotId },
    });
    if (newSlot.appointmentType !== appointment.appointmentType) {
      throw new ValidationError("Typ cieľového slotu nesedí s objednávkou.");
    }

    await tx.appointmentSlot.update({
      where: { id: appointment.slotId },
      data: { status: statusAfterFreeing(appointment.slot.releaseAt, now) },
    });
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "RESCHEDULED",
        cancellationReason: input.reason ?? null,
        updatedByUserId: input.ctx.actorUserId ?? null,
      },
    });

    const newAppointment = await tx.appointment.create({
      data: {
        slotId: newSlot.id,
        patientId: appointment.patientId,
        appointmentType: newSlot.appointmentType,
        status: "SCHEDULED",
        note: appointment.note,
        createdByUserId: input.ctx.actorUserId ?? null,
        updatedByUserId: input.ctx.actorUserId ?? null,
      },
    });

    await recordAudit(tx, {
      entityType: "appointment",
      entityId: appointment.id,
      action: "reschedule",
      before: appointment,
      after: { rescheduledFrom: appointment.slotId, newAppointment },
      reason: input.reason ?? null,
      ctx: input.ctx,
    });
    return newAppointment;
  });
}

export interface UpdateAppointmentInput {
  appointmentId: string;
  status?:
    | "SCHEDULED"
    | "ARRIVED"
    | "NO_SHOW"
    | "CANCELLED"
    | "RESCHEDULED"
    | "COMPLETED";
  note?: string;
  ctx: AuditContext;
}

export async function updateAppointment(input: UpdateAppointmentInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
    });
    if (!before) throw new NotFoundError("Objednávka neexistuje.");

    const updated = await tx.appointment.update({
      where: { id: before.id },
      data: {
        status: input.status,
        note: input.note,
        updatedByUserId: input.ctx.actorUserId ?? null,
      },
    });
    await recordAudit(tx, {
      entityType: "appointment",
      entityId: before.id,
      action: "update",
      before,
      after: updated,
      ctx: input.ctx,
    });
    return updated;
  });
}

export interface UnlockInput {
  slotId: string;
  reason: string;
  ctx: AuditContext;
}

/** Admin override: opens a still-locked/protected slot, with an audited reason. */
export async function unlockSlot(input: UnlockInput) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.appointmentSlot.findUnique({
      where: { id: input.slotId },
    });
    if (!slot) throw new NotFoundError("Slot neexistuje.");
    if (slot.status !== "LOCKED") {
      throw new ConflictError("Slot nie je zamknutý.");
    }

    const updated = await tx.appointmentSlot.update({
      where: { id: slot.id },
      data: { status: "AVAILABLE", lockedReason: input.reason },
    });
    await recordAudit(tx, {
      entityType: "slot",
      entityId: slot.id,
      action: "unlock",
      before: slot,
      after: updated,
      reason: input.reason,
      ctx: input.ctx,
    });
    return updated;
  });
}
