/** Tipos compartilhados no frontend */
import type { Question as DbQuestion } from "@contracts/types";

export type Question = Pick<
  DbQuestion,
  "id" | "topic" | "text" | "options" | "answerIndex" | "explanation"
>;
