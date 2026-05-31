import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { slotRuleCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const data = slotRuleCreateSchema.parse(await req.json());
    const rule = await prisma.slotRule.create({
      data: {
        templateId: data.templateId,
        name: data.name ?? `${data.startTime}–${data.endTime}`,
        startTime: data.startTime,
        endTime: data.endTime,
        appointmentType: data.appointmentType,
        color: data.color,
        isBookable: data.isBookable,
        releasePolicyId: data.releasePolicyId ?? null,
        priority: data.priority ?? 0,
      },
    });
    await recordAudit(prisma, {
      entityType: "slot_rule",
      entityId: rule.id,
      action: "create",
      after: rule,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
