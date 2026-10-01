import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  // arquivos com hash no nome (assets/) nunca mudam: cache de 1 ano;
  // o index.html é sempre revalidado para pegar a versão nova após um deploy
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.status === 200) c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    // Rotas do React (/app, /privacidade…) devolvem o index.html; arquivos
    // inexistentes (com extensão) e /api continuam 404.
    const p = c.req.path;
    const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(p);
    if (c.req.method !== "GET" || p.startsWith("/api/") || looksLikeFile) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    c.header("Cache-Control", "no-cache");
    return c.html(content);
  });
}
