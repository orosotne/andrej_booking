import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { assertNewPatientSlotPassword } from "@/lib/auth/unlock-password";
import { rescheduleAppointment } from "@/lib/booking/booking-service";
import { rescheduleSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ALL_STAFF, body: rescheduleSchema },
  async ({ params, body, audit }) => {
    // Rovnako ako pri objednaní: heslo pre nového pacienta sa overí pred zápisom.
    if (body.newPatientPassword !== undefined) {
      assertNewPatientSlotPassword(body.newPatientPassword);
    }
    const appointment = await rescheduleAppointment({
      appointmentId: params.id,
      newSlotId: body.newSlotId,
      reason: body.reason,
      allowNewPatient: body.newPatientPassword !== undefined,
      ctx: audit,
    });
    return NextResponse.json({ appointment });
  },
);
