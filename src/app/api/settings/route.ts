import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALL_STAFF, ADMIN_ONLY } from "@/lib/auth/rbac";
import { settingsUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineRoute({ roles: ALL_STAFF }, async () => {
  const rows = await prisma.setting.findMany();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({ settings });
});

export const PATCH = defineRoute(
  { roles: ADMIN_ONLY, body: settingsUpdateSchema },
  async ({ body: updates, user, audit }) => {
    await prisma.$transaction(async (tx) => {
      await Promise.all(
        Object.entries(updates).map(([key, value]) =>
          tx.setting.upsert({
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

      await recordAudit(tx, {
        entityType: "settings",
        entityId: "settings",
        action: "update",
        after: updates,
        ctx: audit,
      });
    });
    return NextResponse.json({ ok: true });
  },
);
