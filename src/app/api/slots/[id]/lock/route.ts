import { NextResponse } from "next/server";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { lockSlot } from "@/lib/booking/booking-service";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      password?: string;
      reason?: string;
    };
    // Zamknutie slotu je chránené rovnakým heslom ako odomknutie.
    assertUnlockPassword(body.password, "Nesprávne heslo na zamknutie slotu.");
    const slot = await lockSlot({
      slotId: id,
      reason: body.reason,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ slot });
  } catch (e) {
    return jsonError(e);
  }
}
