import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { slotRuleUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    const data = slotRuleUpdateSchema.parse(await req.json());

    const before = await prisma.slotRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Pravidlo neexistuje.");

    const rule = await prisma.slotRule.update({ where: { id }, data });
    await recordAudit(prisma, {
      entityType: "slot_rule",
      entityId: id,
      action: "update",
      before,
      after: rule,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ rule });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    const before = await prisma.slotRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Pravidlo neexistuje.");

    await prisma.slotRule.delete({ where: { id } });
    await recordAudit(prisma, {
      entityType: "slot_rule",
      entityId: id,
      action: "delete",
      before,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
