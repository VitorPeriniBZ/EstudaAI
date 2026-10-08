/**
 * Cadeia de provedores de IA com fallback automático.
 *
 * Usa SOMENTE os provedores cadastrados pelo admin (tabela ai_providers),
 * do menor `priority` para o maior. Se um provedor falha por quota/crédito,
 * chave inválida ou erro passageiro, a chamada passa para o próximo.
 * Erros de conteúdo abortam (a resposta seria a mesma em qualquer IA).
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { aiProviders, type AiProvider } from "../../db/schema";
import { AiBadOutput, AiRejected, AiTooLarge, classifyAiError } from "./errors";
import { env } from "../lib/env";
import { recordAiEvent } from "./diagnostics";
import { literalBaseUrlProblem } from "./base-url";
import { dualError, UserMessages } from "../lib/user-errors";

interface Candidate {
  name: string;
  model: LanguageModel;
}

/** Monta o LanguageModel de um provedor cadastrado. */
function modelForProvider(p: AiProvider): LanguageModel {
  if (!p.apiKey) throw new Error(`Provedor "${p.name}" sem API key`);
  if (!p.model?.trim()) throw new Error(`Provedor "${p.name}" sem modelo`);
  const baseUrlProblem = literalBaseUrlProblem(p.baseUrl);
  if (baseUrlProblem) throw new Error(`Provedor "${p.name}": ${baseUrlProblem}`);
  if (p.type === "google") {
    // aceita "gemini-2.5-flash" ou "models/gemini-2.5-flash"
    const model = p.model.trim().replace(/^models\//, "");
    return createGoogleGenerativeAI({
      apiKey: p.apiKey.trim(),
      ...(p.baseUrl ? { baseURL: p.baseUrl } : {}),
    })(model);
  }
  if (p.type === "anthropic") {
    return createAnthropic({
      apiKey: p.apiKey.trim(),
      ...(p.baseUrl ? { baseURL: p.baseUrl } : {}),
    })(p.model);
  }
  return createOpenAICompatible({
    name: `provider-${p.id}`,
    baseURL: p.baseUrl || "https://api.openai.com/v1",
    apiKey: p.apiKey.trim(),
    includeUsage: true,
    supportsStructuredOutputs: true,
  })(p.model);
}

async function candidates(needVision: boolean): Promise<Candidate[]> {
  const rows = await getDb().query.aiProviders.findMany({
    where: eq(aiProviders.enabled, true),
    orderBy: asc(aiProviders.priority),
  });
  const list: Candidate[] = [];
  for (const p of rows) {
    if (needVision && !p.vision) continue;
    try {
      list.push({ name: p.name, model: modelForProvider(p) });
    } catch (err) {
      console.warn("[ai] provedor ignorado:", (err as Error).message);
    }
  }
  return list;
}

/** Opções repassadas a cada tentativa. */
export interface AiCallOptions {
  /** nome do provedor desta tentativa (para diagnóstico) */
  providerName: string;
  /** Fração do material a enviar (1 = tudo). Diminui quando o provedor acusa pedido grande demais. */
  contextFactor: number;
}

/** Quantas vezes reduzir o material no mesmo provedor antes de passar para o próximo. */
const MAX_SHRINKS = 2;

/** Próximo fator de redução, mirando ~75% do limite informado pelo provedor. */
function nextFactor(current: number, err: AiTooLarge, shrinkCount: number): number {
  if (shrinkCount === 0 && err.limit && err.requested && err.requested > err.limit) {
    return Math.max(0.05, current * ((err.limit * 0.75) / err.requested));
  }
  return Math.max(0.05, current * 0.5);
}

/**
 * Executa `fn` contra cada provedor até um funcionar.
 * Se não houver nenhum provedor ativo, devolve um erro amigável.
 */
export async function withAiFallback<T>(
  fn: (model: LanguageModel, opts: AiCallOptions) => Promise<T>,
  opts?: { needVision?: boolean },
): Promise<T> {
  const needVision = opts?.needVision ?? false;
  const list = await candidates(needVision);
  if (list.length === 0) {
    throw dualError(
      "PRECONDITION_FAILED",
      needVision
        ? "Nenhuma IA com leitura de imagens está ativa. Cadastre (ou ative) um provedor com \"Lê imagens\" em Admin → Provedores de IA."
        : "Nenhuma IA configurada ainda. Cadastre uma chave em Admin → Provedores de IA.",
      needVision ? UserMessages.imageUnavailable : UserMessages.aiUnavailable,
    );
  }

  const failures: string[] = [];
  let rejections = 0;
  for (const c of list) {
    let contextFactor = 1;
    let shrinks = 0;
    let badOutputRetries = 0;
    for (;;) {
      try {
        return await fn(c.model, { contextFactor, providerName: c.name });
      } catch (err) {
        const classified = classifyAiError(err);
        // pedido grande demais: reduz o material e tenta no mesmo provedor
        if (classified instanceof AiTooLarge && shrinks < MAX_SHRINKS) {
          contextFactor = nextFactor(contextFactor, classified, shrinks++);
          console.warn(`[ai] ${c.name}: pedido grande demais, tentando com ${Math.round(contextFactor * 100)}% do material`);
          continue;
        }
        // saída fora do formato: uma nova tentativa no mesmo provedor costuma resolver
        if (classified instanceof AiBadOutput && badOutputRetries < 1) {
          badOutputRetries++;
          console.warn(`[ai] ${c.name}: ${classified.message} — tentando de novo`);
          continue;
        }
        if (classified instanceof AiRejected) rejections++;
        console.warn(`[ai] ${c.name} falhou, tentando o próximo: ${classified.message}`);
        recordAiEvent({ provider: c.name, kind: "falhou", message: classified.message });
        failures.push(`${c.name}: ${classified.message}`);
        break;
      }
    }
  }

  console.error(`[ai] todas as IAs falharam: ${failures.join(" | ")}`);
  recordAiEvent({ provider: "—", kind: "todas falharam", message: failures.join(" | ") || "sem detalhes" });
  const allRejected = rejections === list.length;
  throw dualError(
    allRejected ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE",
    `Todas as IAs configuradas falharam (${failures.join(" | ") || "sem detalhes"}). Revise as chaves em Admin → Provedores de IA.`,
    allRejected ? UserMessages.aiRejected : UserMessages.aiBusy,
  );
}

/** Teste rápido de um provedor salvo (usado pelo painel admin). */
export async function testProvider(p: AiProvider): Promise<{ ok: boolean; message: string }> {
  const { generateText } = await import("ai");
  let message: string;
  let ok = false;
  try {
    const model = modelForProvider(p);
    const { text } = await generateText({
      model,
      prompt: "Responda apenas com a palavra: ok",
      maxRetries: 0,
    });
    ok = true;
    message = `Respondeu: "${text.slice(0, 60)}"`;
  } catch (err) {
    message = classifyAiError(err).message.slice(0, 400);
  }
  await getDb()
    .update(aiProviders)
    .set({ lastTestAt: new Date(), lastTestOk: ok, lastTestMsg: message })
    .where(eq(aiProviders.id, p.id));
  return { ok, message };
}

/**
 * No boot: se ANTHROPIC_API_KEY existir e ainda não houver nenhum provedor
 * cadastrado, cria o provedor Anthropic automaticamente.
 */
export async function seedProvidersFromEnv(): Promise<void> {
  if (!env.anthropicApiKey) return;
  const db = getDb();
  const existing = await db.select({ id: aiProviders.id }).from(aiProviders).limit(1);
  if (existing.length) return;
  await db.insert(aiProviders).values({
    name: "Anthropic — Claude Sonnet 5",
    type: "anthropic",
    apiKey: env.anthropicApiKey,
    model: env.anthropicModel,
    vision: true,
    priority: 10,
    enabled: true,
  });
  console.log(`[ai] provedor Anthropic (${env.anthropicModel}) cadastrado a partir de ANTHROPIC_API_KEY`);
}

export { AiRejected };
