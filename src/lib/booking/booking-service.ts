import { prisma } from "@/lib/db";
import { recordAudit, type AuditContext } from "@/lib/audit/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type {
  AppointmentTypeLit,
  PatientCategoryLit,
} from "@/lib/slot-engine/types";
import {
  categoryAllowsSlot,
  PATIENT_CATEGORY_LABEL,
} from "@/lib/patient-category";
import { BLOCKING_STATUSES } from "@/lib/appointment-status";

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
  patientCategory: PatientCategoryLit;
  categoryReason?: string;
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
    if (!categoryAllowsSlot(input.patientCategory, slot.appointmentType)) {
      throw new ValidationError(
        `Pacient kategórie '${PATIENT_CATEGORY_LABEL[input.patientCategory]}' nepatrí do tohto slotu.`,
      );
    }
    if (
      input.patientCategory === "INE" &&
      (!input.categoryReason || input.categoryReason.trim().length === 0)
    ) {
      throw new ValidationError("Pri kategórii 'Iné' je dôvod povinný.");
    }

    const appointment = await tx.appointment.create({
      data: {
        slotId: slot.id,
        patientId: input.patientId,
        appointmentType: slot.appointmentType,
        status: "SCHEDULED",
        note: input.note ?? null,
        patientCategory: input.patientCategory,
        categoryReason: input.categoryReason?.trim() || null,
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
        patientCategory: appointment.patientCategory,
        categoryReason: appointment.categoryReason,
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
  reason?: string;
  ctx: AuditContext;
}

/**
 * Admin override: opens a still-locked/protected slot. Gated by the unlock
 * password at the route layer; the reason is optional and kept only for audit.
 */
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
      data: { status: "AVAILABLE", lockedReason: input.reason ?? null },
    });
    await recordAudit(tx, {
      entityType: "slot",
      entityId: slot.id,
      action: "unlock",
      before: slot,
      after: updated,
      reason: input.reason ?? null,
      ctx: input.ctx,
    });
    return updated;
  });
}

export interface LockInput {
  slotId: string;
  reason?: string;
  ctx: AuditContext;
}

/** Re-locks an open (AVAILABLE) slot, e.g. to protect capacity. Booked slots are untouched. */
export async function lockSlot(input: LockInput) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.appointmentSlot.findUnique({
      where: { id: input.slotId },
    });
    if (!slot) throw new NotFoundError("Slot neexistuje.");
    if (slot.status !== "AVAILABLE") {
      throw new ConflictError("Zamknúť možno len voľný slot.");
    }

    const updated = await tx.appointmentSlot.update({
      where: { id: slot.id },
      data: { status: "LOCKED", lockedReason: input.reason ?? null },
    });
    await recordAudit(tx, {
      entityType: "slot",
      entityId: slot.id,
      action: "lock",
      before: slot,
      after: updated,
      reason: input.reason ?? null,
      ctx: input.ctx,
    });
    return updated;
  });
}

export interface DeletePatientInput {
  patientId: string;
  ctx: AuditContext;
  now?: Date;
}

/**
 * Deletes a patient and purges their non-active appointment rows (CANCELLED /
 * RESCHEDULED / NO_SHOW), while refusing as long as real medical history exists
 * (SCHEDULED / ARRIVED / COMPLETED — see BLOCKING_STATUSES).
 *
 * Key invariant: a NO_SHOW row still OCCUPIES its slot (it stays BOOKED — unlike
 * CANCELLED/RESCHEDULED, which already released their slot). Purging a no-show
 * without releasing its slot would leave an orphaned BOOKED slot — phantom,
 * unbookable capacity that no longer maps to any appointment. So every slot
 * still held by one of this patient's purged rows is released first, exactly as
 * a cancellation would (statusAfterFreeing → AVAILABLE if released, else LOCKED).
 */
export async function deletePatient(input: DeletePatientInput) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({
      where: { id: input.patientId },
    });
    if (!patient) throw new NotFoundError("Pacient neexistuje.");

    const blocking = await tx.appointment.count({
      where: { patientId: input.patientId, status: { in: BLOCKING_STATUSES } },
    });
    if (blocking > 0) {
      throw new ValidationError(
        "Pacienta nemožno zmazať — má aktívne objednávky alebo dokončené návštevy. Najprv ich zrušte alebo presuňte.",
      );
    }

    // Release slots this patient's purged rows still hold. After the blocking
    // check the only live-occupant status that can remain is NO_SHOW, and the
    // partial unique index guarantees a BOOKED slot has exactly one live
    // appointment — so this can never free a slot rebooked by someone else.
    const heldSlots = await tx.appointmentSlot.findMany({
      where: {
        status: "BOOKED",
        appointments: {
          some: {
            patientId: input.patientId,
            status: { notIn: ["CANCELLED", "RESCHEDULED"] },
          },
        },
      },
      select: { id: true, releaseAt: true },
    });
    for (const slot of heldSlots) {
      await tx.appointmentSlot.update({
        where: { id: slot.id },
        data: { status: statusAfterFreeing(slot.releaseAt, now) },
      });
    }

    const purged = await tx.appointment.deleteMany({
      where: { patientId: input.patientId },
    });
    await tx.patient.delete({ where: { id: input.patientId } });

    await recordAudit(tx, {
      entityType: "patient",
      entityId: input.patientId,
      action: "delete",
      before: {
        ...patient,
        purgedAppointments: purged.count,
        freedSlots: heldSlots.length,
      },
      ctx: input.ctx,
    });

    return { purged: purged.count, freedSlots: heldSlots.length };
  });
}
