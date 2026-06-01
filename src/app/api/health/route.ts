import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Liveness/readiness probe. Public (no PII): used by uptime monitors and
// Kubernetes liveness/readiness probes. Pings the DB so it reflects real readiness.
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "down", time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
