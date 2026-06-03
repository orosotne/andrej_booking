import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { userUpdateSchema } from "@/lib/validation";
import {
  toAdminUserDTO,
  auditUserSnapshot,
  expiryEndOfDay,
} from "@/lib/auth/user-admin";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { NotFoundError, ValidationError } from "@/lib/errors";

export const PATCH = defineRoute(
  { roles: ADMIN_ONLY, body: userUpdateSchema },
  async ({ params, body: data, user: actor, audit }) => {
    const { id } = params;

    const user = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
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
        const otherActiveAdmins = await tx.user.count({
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

      const updated = await tx.user.update({
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
      await recordAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "update",
        before: auditUserSnapshot(before),
        after: auditUserSnapshot(updated),
        ctx: audit,
      });
      return updated;
    });

    return NextResponse.json({ user: toAdminUserDTO(user) });
  },
);

export const DELETE = defineRoute(
  { roles: ADMIN_ONLY },
  async ({ params, user: actor, audit }) => {
    const { id } = params;
    if (id === actor.id) {
      throw new ValidationError("Nemôžete zmazať vlastný účet.");
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundError("Používateľ neexistuje.");

      // A user referenced by history (audit, appointments, opened days, settings)
      // must not be hard-deleted — the FK would block it and the trail would break.
      // Deactivate instead. Mirrors the patient-delete guard.
      const [audits, created, updated, opened, settings] = await Promise.all([
        tx.auditLog.count({ where: { actorUserId: id } }),
        tx.appointment.count({ where: { createdByUserId: id } }),
        tx.appointment.count({ where: { updatedByUserId: id } }),
        tx.calendarDay.count({ where: { openedByUserId: id } }),
        tx.setting.count({ where: { updatedByUserId: id } }),
      ]);
      if (audits + created + updated + opened + settings > 0) {
        throw new ValidationError(
          "Používateľa nemožno zmazať — má históriu v systéme. Namiesto toho ho deaktivujte.",
        );
      }

      await tx.user.delete({ where: { id } });
      await recordAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "delete",
        before: auditUserSnapshot(user),
        ctx: audit,
      });
    });

    return NextResponse.json({ ok: true });
  },
);
