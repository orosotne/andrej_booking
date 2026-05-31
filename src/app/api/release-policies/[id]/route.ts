import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { releasePolicyUpdateSchema } from "@/lib/validation";
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
    const data = releasePolicyUpdateSchema.parse(await req.json());

    const before = await prisma.releasePolicy.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Pravidlo neexistuje.");

    const policy = await prisma.releasePolicy.update({
      where: { id },
      data: {
        daysBefore: data.daysBefore,
        requiresAdminOverride: data.requiresAdminOverride,
      },
    });
    await recordAudit(prisma, {
      entityType: "release_policy",
      entityId: id,
      action: "update",
      before,
      after: policy,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ policy });
  } catch (e) {
    return jsonError(e);
  }
}
