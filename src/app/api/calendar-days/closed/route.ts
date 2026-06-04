import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { defineRoute } from "@/lib/route";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { holidayName } from "@/lib/holidays-sk";
import type { ClosedDayDTO } from "@/lib/api-types";

// Administratively closed days for the given year: every CLOSED day NOT owned by
// a vacation (those are managed in the vacation list). Covers manual single-day
// closures and closed public holidays, so admins can see and reopen/close them.
export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req }) => {
  const yearParam = new URL(req.url).searchParams.get("year");
  const year = yearParam && Number.isFinite(Number(yearParam)) ? Number(yearParam) : undefined;

  const where = {
    status: "CLOSED" as const,
    closedByVacationId: null,
    ...(year !== undefined && {
      date: { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) },
    }),
  };

  const rows = await prisma.calendarDay.findMany({
    where,
    orderBy: { date: "asc" },
    select: { date: true, note: true },
  });

  const days: ClosedDayDTO[] = rows.map((r) => {
    const date = toIsoDate(r.date);
    return { date, note: r.note, holiday: holidayName(date) };
  });

  return NextResponse.json({ days });
});
