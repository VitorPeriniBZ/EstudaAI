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
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { label: "Gratuito", maxFiles: 3, maxGenerationsPerMonth: 5, maxQuizQuestions: 25 },
  pro: { label: "PRO", maxFiles: null, maxGenerationsPerMonth: null, maxQuizQuestions: 50 },
};

/** Maior quantidade de questões que qualquer plano permite (usado no slider). */
export const MAX_QUIZ_QUESTIONS = 50;

export type GenerationKind = "quiz" | "summary" | "flashcards";
