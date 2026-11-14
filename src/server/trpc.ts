import { TRPCError, initTRPC } from "@trpc/server";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { BorrowRuleError, type RuleCode } from "@/domain/borrow";
import { NotFoundError, type ServiceDeps } from "./borrow-service";

export type Context = ServiceDeps & {
  /** Who the caller says they are. This demo has no real login, see README. */
  userId: string | null;
};

/**
 * Builds the per-request context. HTTP calls identify the user with an
 * `x-user-id` header; WebSocket connections send it once as a connection param.
 */
export function createContextFactory(deps: ServiceDeps) {
  return (opts: CreateHTTPContextOptions | CreateWSSContextFnOptions): Context => {
    const header = opts.req.headers["x-user-id"];
    const fromHeader = typeof header === "string" && header ? header : null;
    const fromSocket = opts.info.connectionParams?.userId ?? null;
    return { ...deps, userId: fromSocket ?? fromHeader };
  };
}

const t = initTRPC.context<Context>().create({
  // Stack traces go to the server log (see index.ts), never into API responses.
  isDev: false,
  errorFormatter({ shape, error }) {
    const rule = error.cause instanceof BorrowRuleError ? error.cause.code : null;
    return { ...shape, data: { ...shape.data, rule } };
  },
});

const RULE_TO_TRPC_CODE: Record<RuleCode, TRPCError["code"]> = {
  INVALID_RANGE: "BAD_REQUEST",
  IN_THE_PAST: "BAD_REQUEST",
  TOO_LONG: "BAD_REQUEST",
  OWN_ITEM: "BAD_REQUEST",
  DATES_TAKEN: "CONFLICT",
  ALREADY_REQUESTED: "CONFLICT",
  NOT_OWNER: "FORBIDDEN",
  NOT_PENDING: "CONFLICT",
};

/** Turns business-rule failures into proper API errors instead of a generic 500. */
const mapDomainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;

  const cause = result.error.cause;
  if (cause instanceof BorrowRuleError) {
    throw new TRPCError({ code: RULE_TO_TRPC_CODE[cause.code], message: cause.message, cause });
  }
  if (cause instanceof NotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: cause.message, cause });
  }
  return result;
});

const requireUser = t.middleware(async ({ ctx, next }) => {
  const user = ctx.userId ? await ctx.collections.users.findOne({ _id: ctx.userId }) : null;
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Choose who you are browsing as first." });
  }
  return next({ ctx: { ...ctx, user } });
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure.use(mapDomainErrors);
export const authedProcedure = publicProcedure.use(requireUser);
