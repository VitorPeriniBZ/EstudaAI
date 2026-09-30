import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { subjectsRouter } from "./subjects-router";
import { materialsRouter } from "./materials-router";
import { studyRouter } from "./study-router";
import { adminRouter } from "./admin-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  subjects: subjectsRouter,
  materials: materialsRouter,
  study: studyRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
