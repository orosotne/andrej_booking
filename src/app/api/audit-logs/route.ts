import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    await requireRole(ADMIN_ONLY);
    const take = Math.min(
      Number(new URL(req.url).searchParams.get("take") ?? 100),
      500,
    );
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: { actor: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ logs });
  } catch (e) {
    return jsonError(e);
  }
}
