import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit, type AuditContext } from "@/lib/audit/audit";
import { ConflictError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

// A unique-index race that slipped past assertNameFree; jsonError would map the
// bare P2002 to its generic "termín je už obsadený" message.
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

const duplicateName = (name: string) =>
  new ConflictError(`Podkategória „${name}“ už existuje.`);

/** Refuses a name another subcategory already uses, ignoring letter case. */
async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.noteCategory.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  if (clash) throw duplicateName(name);
}

export async function listNoteCategories() {
  const rows = await prisma.noteCategory.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, _count: { select: { patients: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    patientCount: r._count.patients,
  }));
}

/** One subcategory with its patients, alphabetically. */
export async function getNoteCategory(id: string) {
  const category = await prisma.noteCategory.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      patients: {
        orderBy: [
          { patient: { lastName: "asc" } },
          { patient: { firstName: "asc" } },
        ],
        select: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              birthYear: true,
              nationalId: true,
              phone: true,
            },
          },
        },
      },
    },
  });
  if (!category) throw new NotFoundError("Podkategória neexistuje.");
  return {
    id: category.id,
    name: category.name,
    patients: category.patients.map((p) => p.patient),
  };
}

export async function createNoteCategory(input: { name: string; ctx: AuditContext }) {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertNameFree(tx, input.name);
      const created = await tx.noteCategory.create({ data: { name: input.name } });
      await recordAudit(tx, {
        entityType: "note_category",
        entityId: created.id,
        action: "create",
        after: created,
        ctx: input.ctx,
      });
      return created;
    });
  } catch (e) {
    throw isUniqueViolation(e) ? duplicateName(input.name) : e;
  }
}

export async function renameNoteCategory(input: {
  id: string;
  name: string;
  ctx: AuditContext;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.noteCategory.findUnique({ where: { id: input.id } });
      if (!before) throw new NotFoundError("Podkategória neexistuje.");
      if (before.name === input.name) return before;
      await assertNameFree(tx, input.name, input.id);
      const updated = await tx.noteCategory.update({
        where: { id: input.id },
        data: { name: input.name },
      });
      await recordAudit(tx, {
        entityType: "note_category",
        entityId: input.id,
        action: "rename",
        before,
        after: updated,
        ctx: input.ctx,
      });
      return updated;
    });
  } catch (e) {
    throw isUniqueViolation(e) ? duplicateName(input.name) : e;
  }
}

/** Deletes a subcategory; its patients only lose the link (cascade), never their record. */
export async function deleteNoteCategory(input: { id: string; ctx: AuditContext }) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.noteCategory.findUnique({
      where: { id: input.id },
      include: { _count: { select: { patients: true } } },
    });
    if (!before) throw new NotFoundError("Podkategória neexistuje.");
    await tx.noteCategory.delete({ where: { id: input.id } });
    await recordAudit(tx, {
      entityType: "note_category",
      entityId: input.id,
      action: "delete",
      before: { name: before.name, patientCount: before._count.patients },
      ctx: input.ctx,
    });
  });
}

export async function addPatientToNoteCategory(input: {
  categoryId: string;
  patientId: string;
  ctx: AuditContext;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.noteCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) throw new NotFoundError("Podkategória neexistuje.");
      const patient = await tx.patient.findUnique({
        where: { id: input.patientId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundError("Pacient neexistuje.");
      const existing = await tx.patientNoteCategory.findUnique({
        where: {
          patientId_categoryId: {
            patientId: input.patientId,
            categoryId: input.categoryId,
          },
        },
      });
      if (existing) throw new ConflictError("Pacient už je v tejto podkategórii.");
      await tx.patientNoteCategory.create({
        data: { patientId: input.patientId, categoryId: input.categoryId },
      });
      await recordAudit(tx, {
        entityType: "note_category",
        entityId: input.categoryId,
        action: "add_patient",
        after: { name: category.name, patientId: input.patientId },
        ctx: input.ctx,
      });
    });
  } catch (e) {
    // Two clicks racing past the `existing` check collide on the primary key.
    throw isUniqueViolation(e)
      ? new ConflictError("Pacient už je v tejto podkategórii.")
      : e;
  }
}

export async function removePatientFromNoteCategory(input: {
  categoryId: string;
  patientId: string;
  ctx: AuditContext;
}) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.noteCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!category) throw new NotFoundError("Podkategória neexistuje.");
    const removed = await tx.patientNoteCategory.deleteMany({
      where: { categoryId: input.categoryId, patientId: input.patientId },
    });
    if (removed.count === 0) {
      throw new NotFoundError("Pacient nie je v tejto podkategórii.");
    }
    await recordAudit(tx, {
      entityType: "note_category",
      entityId: input.categoryId,
      action: "remove_patient",
      before: { name: category.name, patientId: input.patientId },
      ctx: input.ctx,
    });
  });
}
