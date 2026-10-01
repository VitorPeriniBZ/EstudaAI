import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiProviders, materials, subjects, usageEvents, users } from "../db/schema";
import { dayStart, monthStart } from "./lib/plans";
import { GENERATION_KINDS } from "@contracts/plans";
import { testProvider } from "./ai/providers";

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

const providerInput = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(["anthropic", "openai", "google"]),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  baseUrl: z.string().url().max(500).optional().or(z.literal("")),
  model: z.string().min(1, "Informe o modelo").max(160),
  vision: z.boolean().default(false),
  priority: z.number().int().min(0).max(999).default(10),
  enabled: z.boolean().default(true),
});

/** Update sem defaults: campo ausente = não mexe (o .partial() manteria os defaults) */
const providerUpdateInput = z.object({
  id: z.number(),
  name: z.string().min(1).max(160).optional(),
  type: z.enum(["anthropic", "openai", "google"]).optional(),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  baseUrl: z.string().url().max(500).optional().or(z.literal("")),
  model: z.string().min(1).max(160).optional(),
  vision: z.boolean().optional(),
  priority: z.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
});

export const adminRouter = createRouter({
  /* ---------------- Usuários ---------------- */

  listUsers: adminQuery.query(async () => {
    const db = getDb();
    const since = monthStart();
    const rows = await db.select().from(users).orderBy(desc(users.lastSignInAt));
    const files = await db
      .select({ userId: materials.userId, n: count() })
      .from(materials)
      .where(inArray(materials.kind, ["pdf", "image"]))
      .groupBy(materials.userId);
    const gens = await db
      .select({ userId: usageEvents.userId, n: count() })
      .from(usageEvents)
      .where(and(gte(usageEvents.createdAt, since), inArray(usageEvents.kind, [...GENERATION_KINDS])))
      .groupBy(usageEvents.userId);
    const chats = await db
      .select({ userId: usageEvents.userId, n: count() })
      .from(usageEvents)
      .where(and(gte(usageEvents.createdAt, dayStart()), eq(usageEvents.kind, "chat")))
      .groupBy(usageEvents.userId);
    const subj = await db
      .select({ userId: subjects.userId, n: count() })
      .from(subjects)
      .groupBy(subjects.userId);
    const by = (list: { userId: number; n: number }[]) =>
      new Map(list.map((r) => [r.userId, Number(r.n)]));
    const f = by(files), g = by(gens), sj = by(subj), ch = by(chats);
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      role: u.role,
      plan: u.plan,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      files: f.get(u.id) ?? 0,
      generationsThisMonth: g.get(u.id) ?? 0,
      subjects: sj.get(u.id) ?? 0,
      chatToday: ch.get(u.id) ?? 0,
    }));
  }),

  updateUser: adminQuery
    .input(
      z.object({
        id: z.number(),
        role: z.enum(["user", "admin"]).optional(),
        plan: z.enum(["free", "pro"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id && input.role === "user") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Você não pode remover o seu próprio acesso de admin.",
        });
      }
      const patch = {
        ...(input.role ? { role: input.role } : {}),
        ...(input.plan ? { plan: input.plan } : {}),
      };
      if (!Object.keys(patch).length) return { ok: true };
      const [row] = await getDb().update(users).set(patch).where(eq(users.id, input.id)).returning({ id: users.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      return { ok: true };
    }),

  /* ---------------- Provedores de IA ---------------- */

  listProviders: adminQuery.query(async () => {
    const rows = await getDb().query.aiProviders.findMany({
      orderBy: asc(aiProviders.priority),
    });
    // nunca devolve a chave completa ao cliente
    return rows.map((r) => ({ ...r, apiKey: maskKey(r.apiKey) }));
  }),

  createProvider: adminQuery
    .input(providerInput)
    .mutation(async ({ input }) => {
      if (!input.apiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe a API key do provedor.",
        });
      }
      const [{ id }] = await getDb()
        .insert(aiProviders)
        .values({
          name: input.name,
          type: input.type,
          apiKey: input.apiKey || null,
          baseUrl: input.baseUrl || null,
          model: input.model,
          vision: input.vision,
          priority: input.priority,
          enabled: input.enabled,
        })
        .returning({ id: aiProviders.id });
      return { id };
    }),

  updateProvider: adminQuery
    .input(providerUpdateInput)
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      const db = getDb();
      const row = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.id, id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(aiProviders)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          // apiKey ausente/vazia = mantém a atual
          ...(patch.apiKey ? { apiKey: patch.apiKey } : {}),
          ...(patch.baseUrl !== undefined
            ? { baseUrl: patch.baseUrl || null }
            : {}),
          ...(patch.model !== undefined ? { model: patch.model } : {}),
          ...(patch.vision !== undefined ? { vision: patch.vision } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        })
        .where(eq(aiProviders.id, id));
      return { ok: true };
    }),

  deleteProvider: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(aiProviders).where(eq(aiProviders.id, input.id));
      return { ok: true };
    }),

  /** Testa um provedor salvo com uma chamada mínima e grava o diagnóstico */
  testProvider: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const row = await getDb().query.aiProviders.findFirst({
        where: eq(aiProviders.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return testProvider(row);
    }),
});
