/**
 * Planos do EstudaAí. Mude os números aqui para ajustar os limites.
 * `null` = sem limite.
 */
export type PlanId = "free" | "pro";

export interface PlanLimits {
  label: string;
  /** PDFs e imagens guardados na conta (anotações não contam) */
  maxFiles: number | null;
  /** gerações de IA por mês (quiz, resumo e flashcards) */
  maxGenerationsPerMonth: number | null;
  /** questões por quiz */
  maxQuizQuestions: number;
  /** resumos por dia (também contam nas gerações do mês) */
  maxSummariesPerDay: number | null;
  /** flashcards por geração */
  maxFlashcards: number;
  /** perguntas no chat de dúvidas por dia (não contam nas gerações) */
  maxChatPerDay: number | null;
  /** imagens lidas com IA por dia: upload ou reprocessamento de foto (não contam nas gerações) */
  maxExtractsPerDay: number | null;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    label: "Gratuito",
    maxFiles: 3,
    maxGenerationsPerMonth: 5,
    maxQuizQuestions: 25,
    maxSummariesPerDay: 2,
    maxFlashcards: 15,
    maxChatPerDay: 5,
    maxExtractsPerDay: 10,
  },
  // limites de uso justo: o PRO é "sem se preocupar com limites" no uso normal, mas tem
  // teto para o custo de IA não ficar em aberto (números de partida — ajuste aqui)
  pro: {
    label: "PRO",
    maxFiles: null,
    maxGenerationsPerMonth: 300,
    maxQuizQuestions: 50,
    maxSummariesPerDay: null,
    maxFlashcards: 40,
    maxChatPerDay: 100,
    maxExtractsPerDay: 100,
  },
};

/** Maior quantidade de questões que qualquer plano permite (usado no slider). */
export const MAX_QUIZ_QUESTIONS = 50;

/** Maior quantidade de flashcards por geração em qualquer plano. */
export const MAX_FLASHCARDS = 40;

/** Tipos que contam como "geração" no limite mensal. */
export const GENERATION_KINDS = ["quiz", "summary", "flashcards"] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];
/** Tudo o que é registrado em usage_events. */
export type UsageKind = GenerationKind | "chat" | "extract";
