import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { templateApplySchema } from "@/lib/validation";
import { syncTemplateToFutureDays } from "@/lib/slot-engine/sync";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

// Re-applies the template to its already-generated future days. `dryRun: true`
// previews the change without writing. Booked slots are never deleted.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    const { dryRun } = templateApplySchema.parse(await req.json().catch(() => ({})));

    const report = await syncTemplateToFutureDays(id, { dryRun });

    if (!dryRun) {
      await recordAudit(prisma, {
        entityType: "schedule_template",
        entityId: id,
        action: "apply_to_future_days",
        after: report,
        ctx: auditContext(req, user.id),
      });
    }
    return NextResponse.json({ report });
  } catch (e) {
    return jsonError(e);
  }
}
