import { createRouter, authedQuery } from "./middleware";
import { usageSummary } from "./lib/plans";

export const accountRouter = createRouter({
  /** Plano, limites e uso do mês do usuário logado. */
  usage: authedQuery.query(({ ctx }) => usageSummary(ctx.user)),
});
