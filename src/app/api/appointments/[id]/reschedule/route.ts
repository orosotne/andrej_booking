import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { rescheduleAppointment } from "@/lib/booking/booking-service";
import { rescheduleSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ALL_STAFF, body: rescheduleSchema },
  async ({ params, body, audit }) => {
    const appointment = await rescheduleAppointment({
      appointmentId: params.id,
      newSlotId: body.newSlotId,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ appointment });
  },
);
