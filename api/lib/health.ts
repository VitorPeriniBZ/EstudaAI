import { Hono } from "hono";

/**
 * Rotas de saúde.
 *
 *   GET /api/health     → só confirma que o servidor responde. NÃO consulta o banco:
 *                         o Render chama esta rota a cada poucos segundos e o UptimeRobot
 *                         a cada 10 min; se ela tocasse o banco, o Neon nunca ficaria
 *                         ocioso e as horas de compute do plano grátis acabariam no meio do mês.
 *   GET /api/health/db  → confere a conexão com o banco (uso manual ou checagem rara).
 *
 * `pingDb` é recebido de fora para os testes poderem contar as consultas.
 */
export function healthRoutes(pingDb: () => Promise<unknown>) {
  const routes = new Hono();
  routes.get("/", (c) => c.json({ ok: true }));
  routes.get("/db", async (c) => {
    try {
      await pingDb();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false, db: "indisponível" }, 503);
    }
  });
  return routes;
}
