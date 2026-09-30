import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiProviders } from "../db/schema";
import { testProvider } from "./ai/providers";

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

const providerInput = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(["anthropic", "openai"]),
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
  type: z.enum(["anthropic", "openai"]).optional(),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  baseUrl: z.string().url().max(500).optional().or(z.literal("")),
  model: z.string().min(1).max(160).optional(),
  vision: z.boolean().optional(),
  priority: z.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
});

export const adminRouter = createRouter({
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
