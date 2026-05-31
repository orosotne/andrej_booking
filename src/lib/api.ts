import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import type { AuditContext } from "./audit/audit";

/** Maps thrown errors to JSON responses with the right HTTP status. */
export function jsonError(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Neplatné údaje", code: "VALIDATION", issues: e.issues },
      { status: 400 },
    );
  }
  console.error("Unhandled API error:", e);
  return NextResponse.json(
    { error: "Vnútorná chyba servera", code: "INTERNAL" },
    { status: 500 },
  );
}

/** Builds an audit context (actor + client metadata) from the request. */
export function auditContext(
  req: Request,
  actorUserId?: string | null,
): AuditContext {
  return {
    actorUserId: actorUserId ?? null,
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}
