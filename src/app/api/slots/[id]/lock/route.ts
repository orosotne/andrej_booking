import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { lockSlot } from "@/lib/booking/booking-service";
import { dateOnly } from "@/lib/calendar-date";
import { lockSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: lockSchema },
  async ({ params, body, audit }) => {
    // Zamknutie slotu je chránené rovnakým heslom ako odomknutie.
    assertUnlockPassword(body.password, "Nesprávne heslo na zamknutie slotu.");
    const slot = await lockSlot({
      slotId: params.id,
      reason: body.reason,
      until: body.until ? dateOnly(body.until) : null,
      ctx: audit,
    });
    return NextResponse.json({ slot });
  },
);
