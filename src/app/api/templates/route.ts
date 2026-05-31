import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireRole(ADMIN_ONLY);
    const templates = await prisma.scheduleTemplate.findMany({
      orderBy: { dayOfWeek: "asc" },
      include: {
        slotRules: {
          orderBy: { priority: "asc" },
          include: { releasePolicy: true },
        },
      },
    });
    return NextResponse.json({ templates });
  } catch (e) {
    return jsonError(e);
  }
}
