import { NextResponse } from "next/server";
import { requireRole, DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { reopenDay } from "@/lib/slot-engine/generate";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    const user = await requireRole(DOCTOR_ADMIN);
    const { date } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { reason?: string };

    const day = await reopenDay(date);

    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "reopen",
      reason: body.reason ?? null,
      ctx: auditContext(req, user.id),
    });

    return NextResponse.json({ day });
  } catch (e) {
    return jsonError(e);
  }
}
