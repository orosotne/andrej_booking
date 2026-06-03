import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";

export const GET = defineRoute({ roles: ADMIN_ONLY }, async () => {
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
});
