import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  addPatientToNoteCategory,
  createNoteCategory,
  deleteNoteCategory,
  getNoteCategory,
  listNoteCategories,
  removePatientFromNoteCategory,
  renameNoteCategory,
} from "@/lib/notes/note-category-service";
import { NOTE_CATEGORY_NAMES, noteCategoryNames } from "@/lib/notes/note-category-names";
import { deletePatient } from "@/lib/booking/booking-service";
import { ConflictError, NotFoundError } from "@/lib/errors";

// Requires a REAL (throwaway/test) Postgres, like booking.integration.test.ts:
//   RUN_DB_TESTS=1 DATABASE_URL=postgres://... npm test
const RUN = Boolean(process.env.RUN_DB_TESTS);

const ctx = { actorUserId: null };

// What every patient-facing query reads: the red line above the note.
async function namesOf(patientId: string): Promise<string[]> {
  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { noteCategories: NOTE_CATEGORY_NAMES },
  });
  return noteCategoryNames(p.noteCategories);
}

describe.skipIf(!RUN)("note categories (requires DB)", () => {
  let patientId = "";
  const categoryIds: string[] = [];

  beforeAll(async () => {
    const patient = await prisma.patient.create({
      data: { firstName: "Fero", lastName: "Mrkvička" },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await prisma.noteCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("files one patient under several subcategories, in creation order", async () => {
    const pcsk = await createNoteCategory({ name: "PCSK9I", ctx });
    const ar = await createNoteCategory({ name: "AR", ctx });
    categoryIds.push(pcsk.id, ar.id);

    await addPatientToNoteCategory({ categoryId: pcsk.id, patientId, ctx });
    await addPatientToNoteCategory({ categoryId: ar.id, patientId, ctx });

    // The spec's example: "PCSK9I, AR" — not alphabetical.
    expect(await namesOf(patientId)).toEqual(["PCSK9I", "AR"]);
    const list = await listNoteCategories();
    expect(list.filter((c) => categoryIds.includes(c.id))).toEqual([
      { id: pcsk.id, name: "PCSK9I", patientCount: 1 },
      { id: ar.id, name: "AR", patientCount: 1 },
    ]);
    expect((await getNoteCategory(ar.id)).patients.map((p) => p.id)).toEqual([patientId]);
  });

  it("refuses a duplicate name whatever its letter case", async () => {
    await expect(createNoteCategory({ name: "pcsk9i", ctx })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      renameNoteCategory({ id: categoryIds[1], name: "Pcsk9i", ctx }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses adding the same patient twice", async () => {
    await expect(
      addPatientToNoteCategory({ categoryId: categoryIds[0], patientId, ctx }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("renames in place: the patient's line follows the new name", async () => {
    await renameNoteCategory({ id: categoryIds[1], name: "AR – kontrola", ctx });
    expect(await namesOf(patientId)).toEqual(["PCSK9I", "AR – kontrola"]);
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "note_category", entityId: categoryIds[1], action: "rename" },
    });
    expect(audit).not.toBeNull();
  });

  it("removes a patient from one subcategory only", async () => {
    await removePatientFromNoteCategory({ categoryId: categoryIds[1], patientId, ctx });
    expect(await namesOf(patientId)).toEqual(["PCSK9I"]);
    await expect(
      removePatientFromNoteCategory({ categoryId: categoryIds[1], patientId, ctx }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleting a subcategory unfiles its patients but keeps them", async () => {
    await deleteNoteCategory({ id: categoryIds[0], ctx });
    expect(await namesOf(patientId)).toEqual([]);
    expect(await prisma.patient.findUnique({ where: { id: patientId } })).not.toBeNull();
  });

  it("deleting a patient drops their links (cascade)", async () => {
    const p = await prisma.patient.create({ data: { firstName: "Del", lastName: "Notes" } });
    const c = await createNoteCategory({ name: "Dočasná", ctx });
    categoryIds.push(c.id);
    await addPatientToNoteCategory({ categoryId: c.id, patientId: p.id, ctx });

    await deletePatient({ patientId: p.id, ctx });
    expect((await listNoteCategories()).find((x) => x.id === c.id)?.patientCount).toBe(0);
  });
});
