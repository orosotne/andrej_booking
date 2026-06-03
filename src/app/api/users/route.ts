import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { userCreateSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";
import { generatePassphrase } from "@/lib/auth/passphrase";
import {
  USER_LIST_SELECT,
  toAdminUserDTO,
  auditUserSnapshot,
  expiryEndOfDay,
} from "@/lib/auth/user-admin";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { ValidationError } from "@/lib/errors";

export const GET = defineRoute({ roles: ADMIN_ONLY }, async () => {
  const users = await prisma.user.findMany({
    select: USER_LIST_SELECT,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ users: users.map(toAdminUserDTO) });
});

export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: userCreateSchema },
  async ({ body: data, audit }) => {
    const email = data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError("Používateľ s týmto e-mailom už existuje.");
    }

    // New accounts always get a generated passphrase — returned once below so
    // the admin can hand it over. Only the argon2 hash is stored.
    const password = generatePassphrase();
    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name.trim(),
          email,
          role: data.role,
          passwordHash,
          expiresAt: data.expiresAt ? expiryEndOfDay(data.expiresAt) : null,
        },
      });
      await recordAudit(tx, {
        entityType: "user",
        entityId: created.id,
        action: "create",
        after: auditUserSnapshot(created),
        ctx: audit,
      });
      return created;
    });

    return NextResponse.json(
      { user: toAdminUserDTO(user), password },
      { status: 201 },
    );
  },
);
