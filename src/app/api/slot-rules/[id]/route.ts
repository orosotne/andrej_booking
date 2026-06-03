import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { slotRuleUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError } from "@/lib/errors";

export const PATCH = defineRoute(
  { roles: ADMIN_ONLY, body: slotRuleUpdateSchema },
  async ({ params, body: data, audit }) => {
    const { id } = params;

    const rule = await prisma.$transaction(async (tx) => {
      const before = await tx.slotRule.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Pravidlo neexistuje.");

      const updated = await tx.slotRule.update({ where: { id }, data });
      await recordAudit(tx, {
        entityType: "slot_rule",
        entityId: id,
        action: "update",
        before,
        after: updated,
        ctx: audit,
      });
      return updated;
    });
    return NextResponse.json({ rule });
  },
);

export const DELETE = defineRoute(
  { roles: ADMIN_ONLY },
  async ({ params, audit }) => {
    const { id } = params;

    await prisma.$transaction(async (tx) => {
      const before = await tx.slotRule.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Pravidlo neexistuje.");

      await tx.slotRule.delete({ where: { id } });
      await recordAudit(tx, {
        entityType: "slot_rule",
        entityId: id,
        action: "delete",
        before,
        ctx: audit,
      });
    });
    return NextResponse.json({ ok: true });
  },
);
