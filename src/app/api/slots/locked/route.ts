import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { defineRoute } from "@/lib/route";
import type { LockedSlotDTO } from "@/lib/api-types";

// Slots an admin locked by hand for the given year. Only manual locks
// (manualLock=true) are listed — the release-rule engine generates many LOCKED
// slots for capacity protection, which are managed by the rules, not here.
export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req }) => {
  const yearParam = new URL(req.url).searchParams.get("year");
  const year = yearParam && Number.isFinite(Number(yearParam)) ? Number(yearParam) : undefined;

  const where = {
    status: "LOCKED" as const,
    manualLock: true,
    ...(year !== undefined && {
      startAt: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    }),
  };

  const rows = await prisma.appointmentSlot.findMany({
    where,
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      appointmentType: true,
      lockedReason: true,
    },
  });

  const slots: LockedSlotDTO[] = rows.map((r) => ({
    id: r.id,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    appointmentType: r.appointmentType,
    lockedReason: r.lockedReason,
  }));

  return NextResponse.json({ slots });
});
