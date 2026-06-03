import { NextResponse } from "next/server";
import { z } from "zod";
import { ALL_STAFF } from "@/lib/auth/rbac";
import { assertUnlockPassword } from "@/lib/auth/unlock-password";
import { reopenDay } from "@/lib/slot-engine/generate";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit/audit";
import { defineRoute } from "@/lib/route";
import { isoDate } from "@/lib/validation";

// Znovuotvorenie zatvoreného dňa: dôvod je nepovinný (audit), heslo zostáva
// nepovinné v schéme, aby chýbajúce/zlé heslo hlásil assertUnlockPassword
// rovnakou hláškou ako doteraz.
const reopenSchema = z.object({
  reason: z.string().max(500).optional(),
  password: z.string().max(200).optional(),
});

export const POST = defineRoute(
  { roles: ALL_STAFF, body: reopenSchema },
  // Reopening a closed day is allowed for any staff member, incl. nurses;
  // still gated by the shared unlock password below.
  async ({ params, body, audit }) => {
    const { date } = params;
    isoDate.parse(date);
    // Znovuotvorenie zatvoreného dňa je chránené heslom.
    assertUnlockPassword(body.password, "Nesprávne heslo na znovuotvorenie dňa.");

    const day = await reopenDay(date);

    await recordAudit(prisma, {
      entityType: "calendar_day",
      entityId: day.id,
      action: "reopen",
      reason: body.reason ?? null,
      ctx: audit,
    });

    return NextResponse.json({ day });
  },
);
