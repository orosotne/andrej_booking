import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { updateAppointment } from "@/lib/booking/booking-service";
import { updateAppointmentSchema } from "@/lib/validation";
import { auditContext, jsonError } from "@/lib/api";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;
    const body = updateAppointmentSchema.parse(await req.json());
    const appointment = await updateAppointment({
      appointmentId: id,
      status: body.status,
      note: body.note,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ appointment });
  } catch (e) {
    return jsonError(e);
  }
}
