import { NextResponse } from "next/server";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { removePatientFromNoteCategory } from "@/lib/notes/note-category-service";

export const DELETE = defineRoute({ roles: DOCTOR_ADMIN }, async ({ params, audit }) => {
  await removePatientFromNoteCategory({
    categoryId: params.id,
    patientId: params.patientId,
    ctx: audit,
  });
  return NextResponse.json({ ok: true });
});
