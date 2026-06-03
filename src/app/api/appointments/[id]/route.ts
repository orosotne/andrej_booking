import { NextResponse } from "next/server";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { updateAppointment } from "@/lib/booking/booking-service";
import { updateAppointmentSchema } from "@/lib/validation";
import { defineRoute } from "@/lib/route";

export const PATCH = defineRoute(
  { roles: ALL_STAFF, body: updateAppointmentSchema },
  async ({ params, body, audit }) => {
    const appointment = await updateAppointment({
      appointmentId: params.id,
      status: body.status,
      note: body.note,
      ctx: audit,
    });
    return NextResponse.json({ appointment });
  },
);
