import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { materials, usageEvents, type User } from "@db/schema";
import { GENERATION_KINDS, PLANS, type PlanId, type PlanLimits, type UsageKind } from "@contracts/plans";
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

/** Início do dia corrente no horário de Brasília. */
export function dayStart(now = new Date()): Date {
  const br = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0));
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

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function countEvents(db: Db | Tx, userId: number, kinds: readonly UsageKind[], since: Date) {
  const [r] = await db
    .select({ n: count() })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        inArray(usageEvents.kind, [...kinds]),
        gte(usageEvents.createdAt, since),
      ),
    );
  return Number(r?.n ?? 0);
}

export async function countGenerationsThisMonth(userId: number): Promise<number> {
  return countEvents(getDb(), userId, GENERATION_KINDS, monthStart());
}

export async function usageSummary(user: User) {
  const plan = effectivePlan(user);
  const limits = PLANS[plan];
  const db = getDb();
  const [files, generations, summariesToday, chatToday, extractsToday] = await Promise.all([
    countFiles(user.id),
    countEvents(db, user.id, GENERATION_KINDS, monthStart()),
    countEvents(db, user.id, ["summary"], dayStart()),
    countEvents(db, user.id, ["chat"], dayStart()),
    countEvents(db, user.id, ["extract"], dayStart()),
  ]);
  return {
    plan,
    planLabel: limits.label,
    limits,
    usage: { files, generations, summariesToday, chatToday, extractsToday },
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

/** Limite de flashcards por geração. */
export function assertFlashcardsSize(user: User, requested: number) {
  const { maxFlashcards } = limitsFor(user);
  if (requested > maxFlashcards) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `O plano Gratuito gera até ${maxFlashcards} flashcards por vez. Com o PRO você gera até ${PLANS.pro.maxFlashcards}.`,
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

function brDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Limites que se aplicam a cada tipo de uso. No Gratuito a mensagem oferece o PRO;
 * no PRO os tetos são de uso justo (protegem o custo de IA).
 */
export function checksFor(plan: PlanId, kind: UsageKind) {
  const limits = PLANS[plan];
  const pro = plan === "pro";
  const checks: { kinds: readonly UsageKind[]; since: Date; max: number; message: string }[] = [];
  const tomorrow = new Date(dayStart().getTime() + 24 * 3600_000);
  if ((GENERATION_KINDS as readonly UsageKind[]).includes(kind) && limits.maxGenerationsPerMonth !== null) {
    checks.push({
      kinds: GENERATION_KINDS,
      since: monthStart(),
      max: limits.maxGenerationsPerMonth,
      message: pro
        ? `Você chegou ao limite de uso justo do PRO: ${limits.maxGenerationsPerMonth} gerações por mês (quiz, resumo e flashcards). O limite renova em ${brDate(nextMonthStart())}.`
        : `Você usou as ${limits.maxGenerationsPerMonth} gerações do plano Gratuito deste mês (quiz, resumo e flashcards). O limite renova em ${brDate(nextMonthStart())}, ou assine o PRO para gerar até ${PLANS.pro.maxGenerationsPerMonth ?? "sem limite"} por mês.`,
    });
  }
  if (kind === "summary" && limits.maxSummariesPerDay !== null) {
    checks.push({
      kinds: ["summary"],
      since: dayStart(),
      max: limits.maxSummariesPerDay,
      message: `O plano ${limits.label} permite ${limits.maxSummariesPerDay} resumos por dia. Tente de novo amanhã (${brDate(tomorrow)})${pro ? "." : " ou assine o PRO para resumos sem limite diário."}`,
    });
  }
  if (kind === "chat" && limits.maxChatPerDay !== null) {
    checks.push({
      kinds: ["chat"],
      since: dayStart(),
      max: limits.maxChatPerDay,
      message: pro
        ? `Você chegou ao limite de uso justo do PRO: ${limits.maxChatPerDay} perguntas por dia no chat. Volte amanhã (${brDate(tomorrow)}).`
        : `Você usou as ${limits.maxChatPerDay} perguntas de hoje do plano Gratuito. Volte amanhã (${brDate(tomorrow)}) ou assine o PRO para até ${PLANS.pro.maxChatPerDay ?? "quantas quiser"} perguntas por dia.`,
    });
  }
  if (kind === "extract" && limits.maxExtractsPerDay !== null) {
    checks.push({
      kinds: ["extract"],
      since: dayStart(),
      max: limits.maxExtractsPerDay,
      message: pro
        ? `Você chegou ao limite de uso justo do PRO: ${limits.maxExtractsPerDay} imagens lidas por dia. Tente de novo amanhã (${brDate(tomorrow)}) ou envie o conteúdo como PDF.`
        : `O plano Gratuito lê até ${limits.maxExtractsPerDay} imagens por dia com IA. Tente de novo amanhã (${brDate(tomorrow)}), envie o conteúdo como PDF ou digite uma anotação.`,
    });
  }
  return checks;
}

/**
 * Reserva um uso ANTES de chamar a IA, de forma atômica.
 * A trava (pg_advisory_xact_lock por usuário) impede que vários pedidos
 * simultâneos passem todos pela checagem do limite.
 * Devolve uma função para estornar a reserva se a chamada falhar.
 */
export async function reserveUsage(user: User, kind: UsageKind): Promise<() => Promise<void>> {
  const checks = checksFor(effectivePlan(user), kind);
  const id = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7001, ${user.id})`);
    for (const c of checks) {
      if ((await countEvents(tx, user.id, c.kinds, c.since)) >= c.max) {
        throw new TRPCError({ code: "FORBIDDEN", message: c.message });
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
export async function withGeneration<T>(user: User, kind: UsageKind, run: () => Promise<T>): Promise<T> {
  const refund = await reserveUsage(user, kind);
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
