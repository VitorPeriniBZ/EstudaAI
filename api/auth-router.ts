import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, publicQuery } from "./middleware";

/** Dados públicos do usuário (nunca devolve o googleSub). */
function publicUser<T extends { googleSub?: string }>(u: T) {
  const { googleSub: _sub, ...rest } = u;
  return rest;
}

export const authRouter = createRouter({
  /** Usuário logado, ou null (o login em si acontece em /api/auth/google). */
  me: publicQuery.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),

  logout: publicQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: true,
        path: opts.path,
        sameSite: "lax",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
