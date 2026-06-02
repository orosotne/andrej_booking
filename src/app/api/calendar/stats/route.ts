import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { jsonError } from "@/lib/api";
import { calendarRangeSchema } from "@/lib/validation";
import { dateOnly } from "@/lib/calendar-date";
import type { SlotCountsDTO } from "@/lib/api-types";

// Aggregate slot counts for a date range, computed in SQL (GROUP BY status) so a
// whole-year total costs one tiny query instead of shipping every slot. Powers
// the month/year totals in the calendar; per-day numbers come from /api/calendar.
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const { from, to } = calendarRangeSchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    const grouped = await prisma.appointmentSlot.groupBy({
      by: ["status"],
      where: { calendarDay: { date: { gte: dateOnly(from), lte: dateOnly(to) } } },
      _count: { _all: true },
    });

    const stats: SlotCountsDTO = { available: 0, booked: 0, locked: 0 };
    for (const row of grouped) {
      const n = row._count._all;
      if (row.status === "AVAILABLE") stats.available = n;
      else if (row.status === "BOOKED") stats.booked = n;
      else if (row.status === "LOCKED") stats.locked = n;
    }

    return NextResponse.json(stats);
  } catch (e) {
    return jsonError(e);
  }
}
