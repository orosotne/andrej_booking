import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { slotRuleCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: slotRuleCreateSchema },
  async ({ body: data, audit }) => {
    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.slotRule.create({
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
      await recordAudit(tx, {
        entityType: "slot_rule",
        entityId: created.id,
        action: "create",
        after: created,
        ctx: audit,
      });
      return created;
    });
    return NextResponse.json({ rule }, { status: 201 });
  },
);
