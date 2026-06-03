import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { lockSlot } from "@/lib/booking/booking-service";
import { defineRoute } from "@/lib/route";

// Locking a slot only needs the shared unlock password + optional reason; both
// stay optional so the missing/wrong password is reported by
// assertUnlockPassword with the same message as before.
const lockSchema = z.object({
  password: z.string().max(200).optional(),
  reason: z.string().max(500).optional(),
});

export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: lockSchema },
  async ({ params, body, audit }) => {
    // Zamknutie slotu je chránené rovnakým heslom ako odomknutie.
    assertUnlockPassword(body.password, "Nesprávne heslo na zamknutie slotu.");
    const slot = await lockSlot({
      slotId: params.id,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ slot });
  },
);
