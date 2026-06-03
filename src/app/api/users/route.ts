import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
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
import { auditContext, jsonError } from "@/lib/api";
import { ValidationError } from "@/lib/errors";

export async function GET() {
  try {
    await requireRole(ADMIN_ONLY);
    const users = await prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ users: users.map(toAdminUserDTO) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(ADMIN_ONLY);
    const data = userCreateSchema.parse(await req.json());
    const email = data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError("Používateľ s týmto e-mailom už existuje.");
    }

    // New accounts always get a generated passphrase — returned once below so
    // the admin can hand it over. Only the argon2 hash is stored.
    const password = generatePassphrase();
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email,
        role: data.role,
        passwordHash,
        expiresAt: data.expiresAt ? expiryEndOfDay(data.expiresAt) : null,
      },
    });
    await recordAudit(prisma, {
      entityType: "user",
      entityId: user.id,
      action: "create",
      after: auditUserSnapshot(user),
      ctx: auditContext(req, actor.id),
    });

    return NextResponse.json(
      { user: toAdminUserDTO(user), password },
      { status: 201 },
    );
  } catch (e) {
    return jsonError(e);
  }
}
