import { NextResponse } from "next/server";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { unlockSlot } from "@/lib/booking/booking-service";
import { unlockSchema } from "@/lib/validation";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    const body = unlockSchema.parse(await req.json());
    // Zamknutý slot možno otvoriť len heslom — samotný dôvod nestačí.
    assertUnlockPassword(body.password, "Nesprávne heslo na odomknutie slotu.");
    const slot = await unlockSlot({
      slotId: id,
      reason: body.reason,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ slot });
  } catch (e) {
    return jsonError(e);
  }
}
