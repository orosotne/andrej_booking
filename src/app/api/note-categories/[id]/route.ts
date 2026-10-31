import { NextResponse } from "next/server";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { noteCategoryNameSchema } from "@/lib/validation";
import {
  deleteNoteCategory,
  getNoteCategory,
  renameNoteCategory,
} from "@/lib/notes/note-category-service";

export const GET = defineRoute({ roles: DOCTOR_ADMIN }, async ({ params }) => {
  return NextResponse.json({ category: await getNoteCategory(params.id) });
});

export const PATCH = defineRoute(
  { roles: DOCTOR_ADMIN, body: noteCategoryNameSchema },
  async ({ params, body, audit }) => {
    const category = await renameNoteCategory({
      id: params.id,
      name: body.name,
      ctx: audit,
    });
    return NextResponse.json({ category });
  },
);

export const DELETE = defineRoute({ roles: DOCTOR_ADMIN }, async ({ params, audit }) => {
  await deleteNoteCategory({ id: params.id, ctx: audit });
  return NextResponse.json({ ok: true });
});
