import { NextResponse } from "next/server";
import { ADMIN_ONLY } from "@/lib/auth/rbac";
import { defineRoute } from "@/lib/route";
import { vacationUpdateSchema } from "@/lib/validation";
import { deleteVacation, updateVacation } from "@/lib/vacations/vacation-service";
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

export const PATCH = defineRoute(
  { roles: ADMIN_ONLY, body: vacationUpdateSchema },
  async ({ params, body, audit }) => {
    const vacation = await updateVacation({
      id: params.id,
      from: body.from,
      to: body.to,
      reason: body.reason,
      ctx: audit,
    });
    return NextResponse.json({ vacation: toDTO(vacation) });
  },
);

export const DELETE = defineRoute({ roles: ADMIN_ONLY }, async ({ params, audit }) => {
  await deleteVacation({ id: params.id, ctx: audit });
  return NextResponse.json({ ok: true });
});
