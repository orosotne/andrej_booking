import { NextResponse } from "next/server";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { changeSlotDesignation } from "@/lib/booking/booking-service";
import { slotDesignationSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

// PATCH (a partial update of the slot resource) rather than a /designation
// action sibling: book/lock/unlock are verbs, this just rewrites a field.
export const PATCH = defineRoute(
  { roles: DOCTOR_ADMIN, body: slotDesignationSchema },
  async ({ params, body, audit }) => {
    // Zmena určenia je chránená rovnakým heslom ako odomknutie slotu.
    assertUnlockPassword(body.password, "Nesprávne heslo na zmenu určenia slotu.");
    const slot = await changeSlotDesignation({
      slotId: params.id,
      designation: body.designation,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ slot });
  },
);
