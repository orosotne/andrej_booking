import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { unlockSlot } from "@/lib/booking/booking-service";
import { unlockSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: unlockSchema },
  async ({ params, body, audit }) => {
    // Zamknutý slot možno otvoriť len heslom — samotný dôvod nestačí.
    assertUnlockPassword(body.password, "Nesprávne heslo na odomknutie slotu.");
    const slot = await unlockSlot({
      slotId: params.id,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ slot });
  },
);
