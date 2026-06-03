import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { releasePolicyUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";

export const PATCH = defineRoute(
  { roles: ADMIN_ONLY, body: releasePolicyUpdateSchema },
  async ({ params, body: data, audit }) => {
    const { id } = params;

    const policy = await prisma.$transaction(async (tx) => {
      const before = await tx.releasePolicy.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Pravidlo neexistuje.");

      const updated = await tx.releasePolicy.update({
        where: { id },
        data: {
          daysBefore: data.daysBefore,
          requiresAdminOverride: data.requiresAdminOverride,
        },
      });
      await recordAudit(tx, {
        entityType: "release_policy",
        entityId: id,
        action: "update",
        before,
        after: updated,
        ctx: audit,
      });
      return updated;
    });
    return NextResponse.json({ policy });
  },
);
