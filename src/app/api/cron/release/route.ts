import { NextResponse } from "next/server";
import { runDailyMaintenance } from "@/lib/slot-engine/release";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Invoked daily by Vercel Cron (sends Authorization: Bearer $CRON_SECRET).
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyMaintenance();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("Cron release failed:", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
