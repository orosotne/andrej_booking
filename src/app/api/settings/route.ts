import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ALL_STAFF, ADMIN_ONLY } from "@/lib/auth/rbac";
import { settingsUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import type { Prisma } from "@/generated/prisma/client";

export async function GET() {
  try {
    await requireRole(ALL_STAFF);
    const rows = await prisma.setting.findMany();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return NextResponse.json({ settings });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const updates = settingsUpdateSchema.parse(await req.json());

    await prisma.$transaction(
      Object.entries(updates).map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          create: {
            key,
            value: value as Prisma.InputJsonValue,
            updatedByUserId: user.id,
          },
          update: {
            value: value as Prisma.InputJsonValue,
            updatedByUserId: user.id,
          },
        }),
      ),
    );

    await recordAudit(prisma, {
      entityType: "settings",
      entityId: "settings",
      action: "update",
      after: updates,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
