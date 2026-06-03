import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";

const DEFAULT_RETENTION_MONTHS = 24;

// Conservative, admin-triggered, audited purge: removes only long-dead
// appointment records (cancelled/rescheduled) older than the retention window.
// Patients and active appointments are never touched.
export const POST = defineRoute({ roles: ADMIN_ONLY }, async ({ audit }) => {
  const setting = await prisma.setting.findUnique({
    where: { key: "retentionMonths" },
  });
  const months =
    typeof setting?.value === "number" ? setting.value : DEFAULT_RETENTION_MONTHS;

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.appointment.deleteMany({
      where: {
        status: { in: ["CANCELLED", "RESCHEDULED"] },
        updatedAt: { lt: cutoff },
      },
    });

    await recordAudit(tx, {
      entityType: "retention",
      entityId: "purge",
      action: "purge",
      after: { deleted: deleted.count, months, cutoff: cutoff.toISOString() },
      ctx: audit,
    });

    return deleted;
  });

  return NextResponse.json({ deleted: result.count, months });
});
