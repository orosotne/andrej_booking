import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { cancelAppointment } from "@/lib/booking/booking-service";
import { cancelSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const POST = defineRoute(
  { roles: ALL_STAFF, body: cancelSchema },
  async ({ params, body, audit }) => {
    const appointment = await cancelAppointment({
      appointmentId: params.id,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ appointment });
  },
);
