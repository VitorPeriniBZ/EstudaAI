import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { UserFacingCause, UserMessages } from "./lib/user-errors";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  /**
   * Usuário comum nunca recebe detalhes internos: erros com versão "para
   * usuário" usam essa versão; erros internos inesperados viram mensagem genérica.
   * O admin continua recebendo a mensagem técnica completa.
   */
  errorFormatter({ shape, error, ctx }) {
    const isAdmin = ctx?.user?.role === "admin";
    const { stack: _stack, ...data } = shape.data as typeof shape.data & { stack?: string };
    if (isAdmin) return { ...shape, data };
    const cause = error.cause;
    let message = shape.message;
    if (cause instanceof UserFacingCause) message = cause.userMessage;
    else if (error.code === "INTERNAL_SERVER_ERROR") message = UserMessages.generic;
    return { ...shape, message, data };
  },
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
