import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { sql } from "drizzle-orm";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { googleCallbackHandler, googleStartHandler, authenticateRequest } from "./auth/google";
import { storage } from "./lib/storage";
import { getDb } from "./queries/connection";
import { runMigrations } from "./lib/migrate";
import { seedProvidersFromEnv } from "./ai/providers";
import { healthRoutes } from "./lib/health";
import { Paths } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

// gzip em HTML, JS, CSS e JSON (as respostas do tRPC com quiz e resumo são grandes);
// os arquivos enviados (PDF/imagem) ficam de fora, já são comprimidos
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/files/")) return next();
  return compress()(c, next);
});

// upload vai em base64 (15 MB de arquivo ≈ 20 MB de JSON)
app.use("/api/*", bodyLimit({ maxSize: 25 * 1024 * 1024 }));

/* ---------- Login com Google ---------- */
app.get(Paths.googleStart, googleStartHandler());
app.get(Paths.googleCallback, googleCallbackHandler());

/* ---------- Saúde: /api/health (Render, UptimeRobot) não toca o banco; /api/health/db sim ---------- */
app.route("/api/health", healthRoutes(() => getDb().execute(sql`select 1`)));

/* ---------- Arquivos enviados (servidos do Postgres, só para o dono) ---------- */
const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

app.get("/api/files/:id", async (c) => {
  const user = await authenticateRequest(c.req.raw.headers).catch(() => undefined);
  if (!user) return c.json({ error: "Faça login para ver este arquivo" }, 401);
  let file;
  try {
    file = await storage.getOwnedFile(c.req.param("id"), user.id);
  } catch {
    file = undefined;
  }
  if (!file) return c.json({ error: "Arquivo não encontrado" }, 404);

  const inline = INLINE_TYPES.has(file.contentType) && c.req.query("download") !== "1";
  const asciiName = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": INLINE_TYPES.has(file.contentType) ? file.contentType : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/* ---------- API tRPC ---------- */
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

/** Migrations + provedor de IA padrão. Roda a cada start (é idempotente). */
async function startup() {
  await runMigrations();
  await seedProvidersFromEnv();
}

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  await startup();
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`EstudaAí rodando na porta ${port}`);
  });
} else {
  startup().catch((err) => console.error("[startup] falhou:", err));
}
