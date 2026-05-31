import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

const DEFAULT_RETENTION_MONTHS = 24;

// Conservative, admin-triggered, audited purge: removes only long-dead
// appointment records (cancelled/rescheduled) older than the retention window.
// Patients and active appointments are never touched.
export async function POST(req: Request) {
  try {
    const user = await requireRole(ADMIN_ONLY);

    const setting = await prisma.setting.findUnique({
      where: { key: "retentionMonths" },
    });
    const months =
      typeof setting?.value === "number" ? setting.value : DEFAULT_RETENTION_MONTHS;

    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

    const result = await prisma.appointment.deleteMany({
      where: {
        status: { in: ["CANCELLED", "RESCHEDULED"] },
        updatedAt: { lt: cutoff },
      },
    });

    await recordAudit(prisma, {
      entityType: "retention",
      entityId: "purge",
      action: "purge",
      after: { deleted: result.count, months, cutoff: cutoff.toISOString() },
      ctx: auditContext(req, user.id),
    });

    return NextResponse.json({ deleted: result.count, months });
  } catch (e) {
    return jsonError(e);
  }
}
