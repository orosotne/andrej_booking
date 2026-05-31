import type { Prisma } from "@/generated/prisma/client";

export interface AuditContext {
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditParams {
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ctx?: AuditContext;
}

// Snapshots are JSON-serialized so Dates become ISO strings and the value is a
// guaranteed-plain Json payload (audit_logs.before_data / after_data are jsonb).
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Appends an immutable audit entry. Call inside the same transaction as the mutation. */
export async function recordAudit(
  tx: Prisma.TransactionClient,
  params: AuditParams,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: params.ctx?.actorUserId ?? null,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      beforeData: toJson(params.before),
      afterData: toJson(params.after),
      reason: params.reason ?? null,
      ipAddress: params.ctx?.ipAddress ?? null,
      userAgent: params.ctx?.userAgent ?? null,
    },
  });
}
