import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { rescheduleAppointment } from "@/lib/booking/booking-service";
import { rescheduleSchema } from "@/lib/validation";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;
    const body = rescheduleSchema.parse(await req.json());
    const appointment = await rescheduleAppointment({
      appointmentId: id,
      newSlotId: body.newSlotId,
      reason: body.reason,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ appointment });
  } catch (e) {
    return jsonError(e);
  }
}
