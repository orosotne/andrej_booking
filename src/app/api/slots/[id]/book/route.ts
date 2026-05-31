import { NextResponse } from "next/server";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { bookSlot } from "@/lib/booking/booking-service";
import { bookSlotSchema } from "@/lib/validation";
import { auditContext, jsonError } from "@/lib/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;
    const body = bookSlotSchema.parse(await req.json());
    const appointment = await bookSlot({
      slotId: id,
      patientId: body.patientId,
      appointmentType: body.appointmentType,
      note: body.note,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
