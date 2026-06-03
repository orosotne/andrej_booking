import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { vacationCreateSchema } from "@/lib/validation";
import { createVacation, listVacations } from "@/lib/vacations/vacation-service";
import { toIsoDate } from "@/lib/calendar-date";
import type { VacationDTO } from "@/lib/api-types";

function toDTO(v: {
  id: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  createdAt: Date;
}): VacationDTO {
  return {
    id: v.id,
    from: toIsoDate(v.startDate),
    to: toIsoDate(v.endDate),
    reason: v.reason,
    createdAt: v.createdAt.toISOString(),
  };
}

export const GET = defineRoute({ roles: ADMIN_ONLY }, async ({ req }) => {
  const yearParam = new URL(req.url).searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;
  const vacations = await listVacations(
    year && Number.isFinite(year) ? year : undefined,
  );
  return NextResponse.json({ vacations: vacations.map(toDTO) });
});

export const POST = defineRoute(
  { roles: ADMIN_ONLY, body: vacationCreateSchema },
  async ({ body, audit }) => {
    const vacation = await createVacation({
      from: body.from,
      to: body.to,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ vacation: toDTO(vacation) }, { status: 201 });
  },
);
