import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { userUpdateSchema } from "@/lib/validation";
import {
  toAdminUserDTO,
  auditUserSnapshot,
  expiryEndOfDay,
} from "@/lib/auth/user-admin";
import { recordAudit } from "@/lib/audit/audit";
import { auditContext, jsonError } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    const data = userUpdateSchema.parse(await req.json());

    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Používateľ neexistuje.");

    // Anti-lockout: an admin may not deactivate, expire or demote their own
    // account (clearing one's own expiry is fine).
    const removesOwnAccess =
      id === actor.id &&
      (data.isActive === false ||
        Boolean(data.expiresAt) ||
        (data.role !== undefined && data.role !== "ADMIN"));
    if (removesOwnAccess) {
      throw new ValidationError(
        "Nemôžete deaktivovať, expirovať ani znížiť rolu vlastnému účtu.",
      );
    }

    // Never leave the system without an active admin.
    const dropsAdmin =
      before.role === "ADMIN" &&
      (data.isActive === false ||
        Boolean(data.expiresAt) ||
        (data.role !== undefined && data.role !== "ADMIN"));
    if (dropsAdmin) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: "ADMIN",
          isActive: true,
          id: { not: id },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (otherActiveAdmins === 0) {
        throw new ValidationError(
          "Nemožno odobrať prístup poslednému aktívnemu administrátorovi.",
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        role: data.role,
        isActive: data.isActive,
        expiresAt:
          data.expiresAt === undefined
            ? undefined
            : data.expiresAt === null
              ? null
              : expiryEndOfDay(data.expiresAt),
      },
    });
    await recordAudit(prisma, {
      entityType: "user",
      entityId: id,
      action: "update",
      before: auditUserSnapshot(before),
      after: auditUserSnapshot(user),
      ctx: auditContext(req, actor.id),
    });

    return NextResponse.json({ user: toAdminUserDTO(user) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(ADMIN_ONLY);
    const { id } = await ctx.params;
    if (id === actor.id) {
      throw new ValidationError("Nemôžete zmazať vlastný účet.");
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("Používateľ neexistuje.");

    // A user referenced by history (audit, appointments, opened days, settings)
    // must not be hard-deleted — the FK would block it and the trail would break.
    // Deactivate instead. Mirrors the patient-delete guard.
    const [audits, created, updated, opened, settings] = await Promise.all([
      prisma.auditLog.count({ where: { actorUserId: id } }),
      prisma.appointment.count({ where: { createdByUserId: id } }),
      prisma.appointment.count({ where: { updatedByUserId: id } }),
      prisma.calendarDay.count({ where: { openedByUserId: id } }),
      prisma.setting.count({ where: { updatedByUserId: id } }),
    ]);
    if (audits + created + updated + opened + settings > 0) {
      throw new ValidationError(
        "Používateľa nemožno zmazať — má históriu v systéme. Namiesto toho ho deaktivujte.",
      );
    }

    await prisma.user.delete({ where: { id } });
    await recordAudit(prisma, {
      entityType: "user",
      entityId: id,
      action: "delete",
      before: auditUserSnapshot(user),
      ctx: auditContext(req, actor.id),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
