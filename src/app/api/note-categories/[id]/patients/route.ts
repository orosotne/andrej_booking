import { NextResponse } from "next/server";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { noteCategoryPatientSchema } from "@/lib/validation";
import { addPatientToNoteCategory } from "@/lib/notes/note-category-service";

export const POST = defineRoute(
  { roles: DOCTOR_ADMIN, body: noteCategoryPatientSchema },
  async ({ params, body, audit }) => {
    await addPatientToNoteCategory({
      categoryId: params.id,
      patientId: body.patientId,
      ctx: audit,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
);
