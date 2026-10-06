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

/**
 * Pedido maior que o limite do provedor (tokens por minuto, janela de contexto).
 * Dá para tentar de novo com menos material, ou em outro provedor.
 */
export class AiTooLarge extends Error {
  readonly limit: number | null;
  readonly requested: number | null;
  constructor(message: string, limit: number | null, requested: number | null) {
    super(message);
    this.name = "AiTooLarge";
    this.limit = limit;
    this.requested = requested;
  }
}

/**
 * A IA respondeu, mas fora do formato pedido (Groq "json_validate_failed" etc.).
 * Vale tentar de novo no mesmo provedor uma vez e depois passar para o próximo.
 */
export class AiBadOutput extends AiTransient {
  constructor(message: string) {
    super(message);
    this.name = "AiBadOutput";
  }
}

/**
 * Pedido recusado por este provedor (400 sem causa conhecida, política de conteúdo).
 * A cadeia continua no próximo provedor; só vira erro para o usuário se TODOS recusarem.
 */
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
  if (
    err instanceof AiUnavailable ||
    err instanceof AiTransient ||
    err instanceof AiRejected ||
    err instanceof AiTooLarge
  ) {
    return err;
  }
  let e = (err ?? {}) as AnyErr;
  // RetryError do AI SDK: o erro útil é o último
  if (e.name === "AI_RetryError" && e.lastError) e = e.lastError as AnyErr;

  const status = e.statusCode ?? e.status;
  const detail = extractDetail(e).slice(0, 400);

  // pedido grande demais (Groq: 413 "Request too large … tokens per minute";
  // OpenAI/Anthropic: "context length", "prompt is too long")
  if (
    status === 413 ||
    /request too large|tokens per minute|\bTPM\b|context[ _-]?length|maximum context|prompt is too long|too many tokens|reduce (your|the) (message|prompt)/i.test(detail)
  ) {
    const limit = Number((detail.match(/limit[:\s]+(\d+)/i) || [])[1]) || null;
    const requested = Number((detail.match(/requested[:\s]+(\d+)/i) || [])[1]) || null;
    return new AiTooLarge(`Pedido grande demais para este provedor: ${detail}`, limit, requested);
  }

  if (typeof status === "number") {
    if (status === 401 || status === 403) {
      return new AiUnavailable(
        `Chave da API inválida ou sem permissão (${status})${detail ? `: ${detail}` : ""}`,
      );
    }
    if (status === 402) return new AiUnavailable("Sem créditos no provedor");
    if (status === 404) return new AiUnavailable(`Modelo não encontrado: ${detail}`);
    if (status === 429) {
      // "limit: 0" = o modelo não tem cota no plano gratuito
      if (/limit:\s*0\b|free_tier/i.test(detail)) {
        return new AiUnavailable(`Sem cota gratuita para este modelo (429): ${detail}`);
      }
      return new AiTransient(`Limite de requisições atingido (429)${detail ? `: ${detail}` : ""}`);
    }
    if (status === 408 || status >= 500) {
      return new AiTransient(`Serviço instável (${status})${detail ? `: ${detail}` : ""}`);
    }
    if (status === 400 || status === 422) {
      // modelo gerou saída fora do formato (Groq: json_validate_failed / "Failed to generate JSON")
      if (/json_validate_failed|failed to generate json|output_parse_failed|tool_use_failed|could not parse|invalid json/i.test(detail)) {
        return new AiBadOutput(`A IA devolveu um formato inválido: ${detail}`);
      }
      // a Anthropic devolve 400 quando o crédito acaba
      if (/credit|billing|balance|quota/i.test(detail)) {
        return new AiUnavailable("Sem créditos no provedor");
      }
      // Google devolve 400 para chave inválida ("API key not valid")
      if (/api[ _-]?key|unauthenticated|permission/i.test(detail)) {
        return new AiUnavailable(`Chave da API inválida: ${detail}`);
      }
      // recurso que só alguns modelos/provedores suportam → outro provedor pode atender
      if (/response_format|json_schema|structured output|image|vision|multimodal|content type/i.test(detail) &&
          /support|allow|invalid|not available|unsupported/i.test(detail)) {
        return new AiUnavailable(`Recurso não suportado por este modelo: ${detail}`);
      }
      if (/model/i.test(detail) && /not found|not supported|invalid|unknown/i.test(detail)) {
        return new AiUnavailable(`Modelo inválido: ${detail}`);
      }
      return new AiRejected(detail || "Requisição recusada pela IA");
    }
    return new AiRejected(detail || `Falha na IA (HTTP ${status})`);
  }

  // Resposta fora do schema (ex.: JSON inválido no quiz) → outra IA pode acertar
  if (e.name === "AI_NoObjectGeneratedError" || e.name === "AI_TypeValidationError" || e.name === "AI_JSONParseError") {
    return new AiBadOutput("A IA devolveu um formato inválido");
  }
  // Sem status: rede, timeout, stream interrompido
  return new AiTransient(e.message || "Falha de conexão com a IA");
}
