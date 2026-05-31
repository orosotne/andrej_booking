import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ALL_STAFF } from "@/lib/auth/rbac";
import { patientUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(ALL_STAFF);
    const { id } = await ctx.params;
    const data = patientUpdateSchema.parse(await req.json());

    const before = await prisma.patient.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Pacient neexistuje.");

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth:
          data.dateOfBirth === undefined
            ? undefined
            : data.dateOfBirth
              ? new Date(data.dateOfBirth)
              : null,
        phone: data.phone,
        email: data.email,
        externalPatientId: data.externalPatientId,
        note: data.note,
      },
    });
    await recordAudit(prisma, {
      entityType: "patient",
      entityId: id,
      action: "update",
      before,
      after: patient,
      ctx: auditContext(req, user.id),
    });
    return NextResponse.json({ patient });
  } catch (e) {
    return jsonError(e);
  }
}
