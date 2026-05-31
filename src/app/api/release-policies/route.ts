import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, ADMIN_ONLY } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireRole(ADMIN_ONLY);
    const policies = await prisma.releasePolicy.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ policies });
  } catch (e) {
    return jsonError(e);
  }
}
