import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { reopenDay } from "@/lib/slot-engine/generate";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  try {
    // Reopening a closed day is allowed for any staff member, incl. nurses;
    // still gated by the shared unlock password below.
    const user = await requireRole(ALL_STAFF);
    const { date } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      reason?: string;
      password?: string;
    };
    // Znovuotvorenie zatvoreného dňa je chránené heslom.
    assertUnlockPassword(body.password, "Nesprávne heslo na znovuotvorenie dňa.");

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
