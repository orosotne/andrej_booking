import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { cancelAppointment } from "@/lib/booking/booking-service";
import { cancelSchema } from "@/lib/validation";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;
    const body = cancelSchema.parse(await req.json());
    const appointment = await cancelAppointment({
      appointmentId: id,
      reason: body.reason,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ appointment });
  } catch (e) {
    return jsonError(e);
  }
}
