import { NextResponse } from "next/server";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { noteCategoryNameSchema } from "@/lib/validation";
import {
  createNoteCategory,
  listNoteCategories,
} from "@/lib/notes/note-category-service";

// Poznámky are managed by the doctor (and admin) only. Nurses read the
// subcategory names off the patient, never through these routes.
export const GET = defineRoute({ roles: DOCTOR_ADMIN }, async () => {
  return NextResponse.json({ categories: await listNoteCategories() });
});

export const POST = defineRoute(
  { roles: DOCTOR_ADMIN, body: noteCategoryNameSchema },
  async ({ body, audit }) => {
    const category = await createNoteCategory({ name: body.name, ctx: audit });
    return NextResponse.json({ category }, { status: 201 });
  },
);
