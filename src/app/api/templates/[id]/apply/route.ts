import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { templateApplySchema } from "@/lib/validation";
import { syncTemplateToFutureDays } from "@/lib/slot-engine/sync";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";

// Re-applies the template to its already-generated future days. `dryRun: true`
// previews the change without writing. Booked slots are never deleted.
export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: templateApplySchema },
  async ({ params, body: { dryRun }, audit }) => {
    const { id } = params;

    const report = await syncTemplateToFutureDays(id, { dryRun });

    if (!dryRun) {
      await recordAudit(prisma, {
        entityType: "schedule_template",
        entityId: id,
        action: "apply_to_future_days",
        after: report,
        ctx: audit,
      });
    }
    return NextResponse.json({ report });
  },
);
