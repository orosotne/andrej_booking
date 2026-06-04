import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { defineRoute } from "@/lib/route";
import { dateOnly, toIsoDate, isLastFridayOfMonth, WEEKDAY } from "@/lib/calendar-date";
import { holidayName } from "@/lib/holidays-sk";
import type { ClosedDayDTO } from "@/lib/api-types";

// Administratively closed days for the given year: CLOSED days NOT owned by a
// vacation (those are managed in the vacation list). Rule-based default closures
// (every Wednesday, every last Friday) are excluded — they are closed by the
// standing schedule regardless, so listing them is noise. Closed public holidays
// are kept (admins want them visible). What remains: genuine manual closures.
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

  const days: ClosedDayDTO[] = rows
    .map((r) => {
      const date = toIsoDate(r.date);
      return { date, note: r.note, holiday: holidayName(date) };
    })
    .filter((d) => {
      if (d.holiday) return true; // closed holidays stay visible
      const day = dateOnly(d.date);
      if (day.getUTCDay() === WEEKDAY.WED) return false; // default-closed by rule
      if (isLastFridayOfMonth(day)) return false; // default-closed by rule
      return true;
    });

  return NextResponse.json({ days });
});
