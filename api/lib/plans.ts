import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { materials, usageEvents, type User } from "@db/schema";
import { PLANS, type GenerationKind, type PlanId, type PlanLimits } from "@contracts/plans";
import { getDb } from "../queries/connection";

/** Admin tem acesso completo; os demais seguem o plano salvo. */
export function effectivePlan(user: Pick<User, "role" | "plan">): PlanId {
  return user.role === "admin" ? "pro" : (user.plan as PlanId);
}

export function limitsFor(user: Pick<User, "role" | "plan">): PlanLimits {
  return PLANS[effectivePlan(user)];
}

/** Início do mês corrente no horário de Brasília (UTC-3). */
export function monthStart(now = new Date()): Date {
  const br = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0));
}

export function nextMonthStart(now = new Date()): Date {
  const s = monthStart(now);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1, 3, 0, 0));
}

export async function countFiles(userId: number): Promise<number> {
  const [r] = await getDb()
    .select({ n: count() })
    .from(materials)
    .where(and(eq(materials.userId, userId), inArray(materials.kind, ["pdf", "image"])));
  return Number(r?.n ?? 0);
}

export async function countGenerationsThisMonth(userId: number): Promise<number> {
  const [r] = await getDb()
    .select({ n: count() })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, monthStart())));
  return Number(r?.n ?? 0);
}

export async function usageSummary(user: User) {
  const plan = effectivePlan(user);
  const limits = PLANS[plan];
  const [files, generations] = await Promise.all([
    countFiles(user.id),
    countGenerationsThisMonth(user.id),
  ]);
  return {
    plan,
    planLabel: limits.label,
    limits,
    usage: { files, generations },
    resetsAt: nextMonthStart().toISOString(),
  };
}

/** Bloqueia upload acima do limite de arquivos do plano. */
export async function assertCanUpload(user: User) {
  const { maxFiles } = limitsFor(user);
  if (maxFiles === null) return;
  if ((await countFiles(user.id)) >= maxFiles) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `O plano Gratuito permite até ${maxFiles} arquivos (PDF ou imagem). Exclua um arquivo ou assine o PRO para enviar sem limite. Anotações digitadas não contam.`,
    });
  }
}

/** Limite de questões por quiz. */
export function assertQuizSize(user: User, requested: number) {
  const { maxQuizQuestions } = limitsFor(user);
  if (requested > maxQuizQuestions) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `O plano Gratuito gera até ${maxQuizQuestions} questões por quiz. Com o PRO você gera até ${PLANS.pro.maxQuizQuestions}.`,
    });
  }
}

/**
 * Reserva uma geração ANTES de chamar a IA, de forma atômica.
 * A trava (pg_advisory_xact_lock por usuário) impede que vários pedidos
 * simultâneos passem todos pela checagem do limite.
 * Devolve uma função para estornar a reserva se a geração falhar.
 */
export async function reserveGeneration(user: User, kind: GenerationKind): Promise<() => Promise<void>> {
  const { maxGenerationsPerMonth } = limitsFor(user);
  const id = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7001, ${user.id})`);
    if (maxGenerationsPerMonth !== null) {
      const [r] = await tx
        .select({ n: count() })
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, monthStart())));
      if (Number(r?.n ?? 0) >= maxGenerationsPerMonth) {
        const resets = nextMonthStart().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Você usou as ${maxGenerationsPerMonth} gerações do plano Gratuito deste mês (quiz, resumo e flashcards). O limite renova em ${resets}, ou assine o PRO para gerar sem limite.`,
        });
      }
    }
    const [row] = await tx.insert(usageEvents).values({ userId: user.id, kind }).returning({ id: usageEvents.id });
    return row.id;
  });
  return async () => {
    await getDb().delete(usageEvents).where(eq(usageEvents.id, id));
  };
}

/** Executa uma geração já com a vaga reservada; estorna se der erro. */
export async function withGeneration<T>(user: User, kind: GenerationKind, run: () => Promise<T>): Promise<T> {
  const refund = await reserveGeneration(user, kind);
  try {
    return await run();
  } catch (err) {
    await refund().catch(() => {});
    throw err;
  }
}

/**
 * Uploads: trava por usuário enquanto confere o limite e grava o arquivo,
 * para envios simultâneos não passarem do limite juntos.
 * (o Render grátis roda uma única instância, então uma trava em memória basta)
 */
const uploadLocks = new Map<number, Promise<unknown>>();
export async function withUploadSlot<T>(user: User, run: () => Promise<T>): Promise<T> {
  const prev = uploadLocks.get(user.id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    await assertCanUpload(user);
    return run();
  });
  uploadLocks.set(user.id, next);
  try {
    return await next;
  } finally {
    if (uploadLocks.get(user.id) === next) uploadLocks.delete(user.id);
  }
}
