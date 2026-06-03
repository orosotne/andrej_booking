import { NextResponse } from "next/server";
import { DOCTOR_ADMIN } from "@/lib/auth/rbac";
import { generateDay } from "@/lib/slot-engine/generate";
import { defineRoute } from "@/lib/route";
import { recordAudit } from "@/lib/audit/audit";
import { prisma } from "@/lib/db";
import { isPastIsoDate } from "@/lib/calendar-date";
import { todayIso } from "@/lib/format";
import { isoDate } from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

export const POST = defineRoute(
  { roles: DOCTOR_ADMIN },
  async ({ params, audit }) => {
    const { date } = params;
    isoDate.parse(date);
    if (isPastIsoDate(date, todayIso())) {
      throw new ValidationError("Nemožno generovať deň v minulosti.");
    }
    const day = await generateDay(date);
    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "generate",
      ctx: audit,
    });
    return NextResponse.json({ day });
  },
);
