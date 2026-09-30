/**
 * Cadeia de provedores de IA com fallback automático.
 *
 * Ordem de tentativa:
 *   1. Provedores cadastrados pelo admin (tabela ai_providers), por prioridade;
 *   2. Gateway Kimi da plataforma (fallback final, se provisionado).
 *
 * Se um provedor falha por quota esgotada (AiUnavailable) ou erro transitório
 * (AiTransient — rate limit, timeout, 5xx), a chamada passa para o próximo.
 * Erros de conteúdo/configuração abortam imediatamente.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { aiProviders, type AiProvider } from "../../db/schema";
import {
  AiTransient,
  AiUnavailable,
  classifyAiError,
  listModels,
} from "./ai-client";

interface Candidate {
  name: string;
  model: LanguageModel;
}

let kimiDefaultModel: string | null = null;
let kimiVisionModel: string | null = null;

async function kimiModelId(needVision: boolean): Promise<string> {
  if (needVision) {
    if (!kimiVisionModel) {
      const { models, defaultModelId } = await listModels();
      kimiVisionModel =
        models.find((m) => m.supportsImageIn)?.id ?? defaultModelId;
    }
    return kimiVisionModel;
  }
  if (!kimiDefaultModel) {
    kimiDefaultModel = (await listModels()).defaultModelId;
  }
  return kimiDefaultModel;
}

function kimiGatewayModel(modelId: string): LanguageModel {
  const gw = createOpenAICompatible({
    name: "kimi-gw",
    baseURL: process.env.KIMI_AGENTGW_BASE_URL!,
    apiKey: process.env.KIMI_AGENTGW_API_KEY!,
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
  return gw(modelId);
}

/** Monta o LanguageModel de um provedor cadastrado. */
async function modelForProvider(
  p: AiProvider,
  needVision: boolean,
): Promise<LanguageModel> {
  if (p.type === "anthropic") {
    if (!p.apiKey) throw new Error("Provedor Anthropic sem API key");
    return createAnthropic({
      apiKey: p.apiKey,
      ...(p.baseUrl ? { baseURL: p.baseUrl } : {}),
    })(p.model);
  }
  if (p.type === "openai") {
    if (!p.apiKey) throw new Error("Provedor OpenAI-compatível sem API key");
    return createOpenAICompatible({
      name: `provider-${p.id}`,
      baseURL: p.baseUrl || "https://api.openai.com/v1",
      apiKey: p.apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true,
    })(p.model);
  }
  // gateway da plataforma (sem chave do usuário; model pode estar vazio → usa default)
  const modelId = p.model?.trim() ? p.model : await kimiModelId(needVision);
  return kimiGatewayModel(modelId);
}

async function candidates(needVision: boolean): Promise<Candidate[]> {
  const rows = await getDb().query.aiProviders.findMany({
    where: eq(aiProviders.enabled, true),
    orderBy: asc(aiProviders.priority),
  });

  const list: Candidate[] = [];
  let hasGatewayRow = false;
  for (const p of rows) {
    if (needVision && !p.vision && p.type !== "gateway") continue;
    if (p.type === "gateway") hasGatewayRow = true;
    try {
      list.push({ name: p.name, model: await modelForProvider(p, needVision) });
    } catch {
      // provedor mal configurado: pula para o próximo
    }
  }

  // Fallback final: gateway da plataforma (se não cadastrado explicitamente)
  if (
    !hasGatewayRow &&
    process.env.KIMI_AGENTGW_BASE_URL &&
    process.env.KIMI_AGENTGW_API_KEY
  ) {
    try {
      list.push({
        name: "Kimi (plataforma)",
        model: kimiGatewayModel(await kimiModelId(needVision)),
      });
    } catch {
      // gateway indisponível — segue só com os cadastrados
    }
  }
  return list;
}

/**
 * Executa `fn` contra cada provedor até um funcionar.
 * Fallback só em AiUnavailable (quota) e AiTransient (rate limit/5xx).
 */
export async function withAiFallback<T>(
  fn: (model: LanguageModel) => Promise<T>,
  opts?: { needVision?: boolean },
): Promise<T> {
  const list = await candidates(opts?.needVision ?? false);
  if (list.length === 0) {
    throw new AiUnavailable(
      "Nenhuma IA configurada. O administrador precisa cadastrar um provedor no painel Admin.",
    );
  }

  const failures: string[] = [];
  for (const c of list) {
    try {
      return await fn(c.model);
    } catch (err) {
      const classified = classifyAiError(err);
      if (
        classified instanceof AiUnavailable ||
        classified instanceof AiTransient
      ) {
        failures.push(`${c.name}: ${classified.message}`);
        continue; // tenta o próximo provedor
      }
      throw classified; // erro terminal (conteúdo, configuração, validação)
    }
  }

  throw new AiUnavailable(
    `Todas as IAs configuradas falharam (${failures.join(" | ") || "sem detalhes"}). ` +
      "Tente novamente em instantes ou adicione outro provedor no painel Admin.",
  );
}

/** Teste rápido de um provedor salvo (usado pelo painel admin). */
export async function testProvider(
  p: AiProvider,
): Promise<{ ok: boolean; message: string }> {
  const { generateText } = await import("ai");
  let message: string;
  let ok = false;
  try {
    const model = await modelForProvider(p, false);
    const { text } = await generateText({
      model,
      prompt: "Responda apenas com a palavra: ok",
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
