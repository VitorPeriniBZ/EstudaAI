/**
 * Classificação de erros das chamadas de IA (Anthropic / OpenAI-compatíveis),
 * usada pela cadeia de failover em providers.ts.
 */

/** Provedor indisponível para esta chamada (quota, crédito, chave, modelo) → tenta o próximo */
export class AiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailable";
  }
}

/** Erro passageiro (rate limit, timeout, 5xx, sobrecarga) → tenta o próximo */
export class AiTransient extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTransient";
  }
}

/** Erro terminal (conteúdo recusado, requisição inválida) → não adianta trocar de IA */
export class AiRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRejected";
  }
}

type AnyErr = {
  name?: string;
  status?: number;
  statusCode?: number;
  message?: string;
  responseBody?: unknown;
  data?: { error?: { type?: string; message?: string } };
  cause?: unknown;
  lastError?: unknown;
  errors?: unknown[];
};

function extractDetail(e: AnyErr): string {
  const fromData = e.data?.error?.message;
  if (fromData) return fromData;
  if (typeof e.responseBody === "string") {
    try {
      const parsed = JSON.parse(e.responseBody) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      return e.responseBody.slice(0, 300);
    }
  }
  return e.message ?? "";
}

export function classifyAiError(err: unknown): Error {
  if (err instanceof AiUnavailable || err instanceof AiTransient || err instanceof AiRejected) {
    return err;
  }
  let e = (err ?? {}) as AnyErr;
  // RetryError do AI SDK: o erro útil é o último
  if (e.name === "AI_RetryError" && e.lastError) e = e.lastError as AnyErr;

  const status = e.statusCode ?? e.status;
  const detail = extractDetail(e).slice(0, 400);

  if (typeof status === "number") {
    if (status === 401 || status === 403) {
      return new AiUnavailable(
        `Chave da API inválida ou sem permissão (${status})${detail ? `: ${detail}` : ""}`,
      );
    }
    if (status === 402) return new AiUnavailable("Sem créditos no provedor");
    if (status === 404) return new AiUnavailable(`Modelo não encontrado: ${detail}`);
    if (status === 429) return new AiTransient("Limite de requisições atingido");
    if (status === 408 || status >= 500) return new AiTransient(`Serviço instável (${status})`);
    if (status === 400) {
      // a Anthropic devolve 400 quando o crédito acaba
      if (/credit|billing|balance|quota/i.test(detail)) {
        return new AiUnavailable("Sem créditos no provedor");
      }
      // Google devolve 400 para chave inválida ("API key not valid")
      if (/api[ _-]?key|unauthenticated|permission/i.test(detail)) {
        return new AiUnavailable(`Chave da API inválida: ${detail}`);
      }
      if (/model/i.test(detail) && /not found|not supported|invalid|unknown/i.test(detail)) {
        return new AiUnavailable(`Modelo inválido: ${detail}`);
      }
      return new AiRejected(detail || "Requisição recusada pela IA");
    }
    return new AiRejected(detail || `Falha na IA (HTTP ${status})`);
  }

  // Resposta fora do schema (ex.: JSON inválido no quiz) → outra IA pode acertar
  if (e.name === "AI_NoObjectGeneratedError" || e.name === "AI_TypeValidationError") {
    return new AiTransient("A IA devolveu um formato inválido");
  }
  // Sem status: rede, timeout, stream interrompido
  return new AiTransient(e.message || "Falha de conexão com a IA");
}
