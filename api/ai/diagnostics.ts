/**
 * Últimas falhas das IAs, em memória (para o painel admin, sem precisar abrir os
 * logs do Render). Zera quando o servidor reinicia; guarda as 30 mais recentes.
 */
export type AiEvent = {
  at: string;
  provider: string;
  /** "falhou" = passou para a próxima IA; "plano B" = usou JSON em texto; "todas falharam" */
  kind: "falhou" | "plano B" | "todas falharam";
  message: string;
};

const MAX = 30;
const events: AiEvent[] = [];

export function recordAiEvent(e: Omit<AiEvent, "at">) {
  events.unshift({ ...e, at: new Date().toISOString(), message: e.message.slice(0, 600) });
  if (events.length > MAX) events.length = MAX;
}

export function recentAiEvents(): AiEvent[] {
  return events.slice();
}
