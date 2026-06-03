import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";

export const GET = defineRoute({ roles: ADMIN_ONLY }, async () => {
  const policies = await prisma.releasePolicy.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ policies });
});
