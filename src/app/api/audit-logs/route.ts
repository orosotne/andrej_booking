import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";

// Audit logs grow without bound, so reads are cursor-paginated. With no cursor
// the response is unchanged from before (newest `take` rows). A `nextCursor`
// (the id of the last row, or null when the page isn't full) is added so older
// entries — previously unreachable past the newest 500 — can be paged via
// `?cursor=<id>`. The extra field is additive and ignored by existing callers.
export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req }) => {
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") ?? 100), 500);
  const cursor = url.searchParams.get("cursor");

  const logs = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { actor: { select: { name: true, email: true } } },
  });

  const nextCursor = logs.length === take ? logs[logs.length - 1].id : null;
  return NextResponse.json({ logs, nextCursor });
});
