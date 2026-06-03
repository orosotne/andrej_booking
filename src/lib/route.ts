import type { ZodType } from "zod";
import { auditContext, jsonError } from "@/lib/api";
import { requireRole, type Role, type SessionUser } from "@/lib/auth/rbac";
import type { AuditContext } from "@/lib/audit/audit";

/** Dynamic route params are always string-valued (resolved from the URL). */
type Params = Record<string, string>;

interface RouteOptions<B> {
  /** Roles allowed to call this route. Public routes (cron/health) skip the wrapper. */
  roles: Role[];
  /** Zod schema for the JSON body. Omit for routes with no body (GET/DELETE). */
  body?: ZodType<B>;
}

interface RouteArgs<B> {
  req: Request;
  params: Params;
  body: B;
  user: SessionUser;
  audit: AuditContext;
}

/**
 * Wraps a route handler with the cross-cutting envelope every API route shares:
 * RBAC, async-params resolution, JSON-body zod validation, audit-context
 * construction and the central error→JSON mapping (jsonError).
 *
 * Behaviour is identical to the hand-written `try { requireRole(); await
 * ctx.params; schema.parse(await req.json()) } catch (e) { return jsonError(e) }`
 * the routes used before — the handler still returns its own NextResponse, so
 * status codes and payload shapes are unchanged. The only consolidation is that
 * the boilerplate lives in one place instead of being copy-pasted per route.
 */
export function defineRoute<B = undefined>(
  opts: RouteOptions<B>,
  handler: (args: RouteArgs<B>) => Promise<Response>,
) {
  return async (
    req: Request,
    ctx?: { params: Promise<Params> },
  ): Promise<Response> => {
    try {
      const user = await requireRole(opts.roles);
      const params = (ctx ? await ctx.params : {}) as Params;
      // Defensive parse: an empty/invalid body becomes {} so a missing field is
      // reported as a clean 400 by zod rather than a JSON-parse 500.
      const body = (
        opts.body ? opts.body.parse(await req.json().catch(() => ({}))) : undefined
      ) as B;
      const audit = auditContext(req, user.id);
      return await handler({ req, params, body, user, audit });
    } catch (e) {
      return jsonError(e);
    }
  };
}
