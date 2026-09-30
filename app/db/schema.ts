import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  json,
  longtext,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------- EstudaAí ----------

/** Matéria/disciplina do estudante (ex.: "Parasitologia") */
export const subjects = mysqlTable("subjects", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  /** chave da cor ("giemsa" | "lugol" | "hema" | "madder" | "neutral") */
  color: varchar("color", { length: 24 }).default("hema").notNull(),
  /** resumo gerado por IA (markdown) */
  summary: longtext("summary"),
  summaryAt: timestamp("summaryAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Subject = typeof subjects.$inferSelect;

/** Material enviado: pdf, imagem ou anotação digitada */
export const materials = mysqlTable("materials", {
  id: serial("id").primaryKey(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  kind: mysqlEnum("kind", ["pdf", "image", "note"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  /** chave no object storage (pdf/imagem); null para notas */
  fileKey: varchar("fileKey", { length: 512 }),
  fileSize: bigint("fileSize", { mode: "number", unsigned: true }),
  /** texto extraído do arquivo ou conteúdo da nota */
  textContent: longtext("textContent"),
  status: mysqlEnum("status", ["processing", "ready", "error"])
    .default("processing")
    .notNull(),
  statusMsg: varchar("statusMsg", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Material = typeof materials.$inferSelect;

/** Quiz gerado por IA a partir dos materiais da matéria */
export const quizzes = mysqlTable("quizzes", {
  id: serial("id").primaryKey(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Quiz = typeof quizzes.$inferSelect;

export type QuestionOption = string;

export const questions = mysqlTable("questions", {
  id: serial("id").primaryKey(),
  quizId: bigint("quizId", { mode: "number", unsigned: true }).notNull(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  topic: varchar("topic", { length: 160 }).default("Geral").notNull(),
  text: text("text").notNull(),
  options: json("options").$type<QuestionOption[]>().notNull(),
  answerIndex: int("answerIndex").notNull(),
  explanation: text("explanation").notNull(),
});

export type Question = typeof questions.$inferSelect;

/** Tentativa de quiz (para progresso e "revisar erradas") */
export const quizAttempts = mysqlTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  quizId: bigint("quizId", { mode: "number", unsigned: true }).notNull(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  total: int("total").notNull(),
  correct: int("correct").notNull(),
  wrongQuestionIds: json("wrongQuestionIds").$type<number[]>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuizAttempt = typeof quizAttempts.$inferSelect;

/** Flashcards gerados por IA */
export const flashcards = mysqlTable("flashcards", {
  id: serial("id").primaryKey(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  /** marcação simples de domínio: 0 novo, 1 aprendendo, 2 dominado */
  mastery: int("mastery").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Flashcard = typeof flashcards.$inferSelect;

/** Histórico do chat de dúvidas por matéria */
export const chatMessages = mysqlTable("chat_messages", {
  id: serial("id").primaryKey(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

/**
 * Provedores de IA configuráveis pelo admin (dono do site).
 * Cadeia de failover: usa o de menor `priority` primeiro; se esgotar quota/
 * der erro transitório, cai para o próximo. Se nenhum estiver ativo, usa o
 * gateway da plataforma (env KIMI_AGENTGW_*) como fallback.
 */
export const aiProviders = mysqlTable("ai_providers", {
  id: serial("id").primaryKey(),
  /** rótulo amigável, ex.: "Anthropic — Sonnet 5.5" */
  name: varchar("name", { length: 160 }).notNull(),
  /**
   * anthropic  → @ai-sdk/anthropic (baseUrl opcional)
   * openai     → qualquer endpoint OpenAI-compatível (baseUrl obrigatória)
   * gateway    → gateway da plataforma Kimi (sem chave; usa env do servidor)
   */
  type: mysqlEnum("type", ["anthropic", "openai", "gateway"]).notNull(),
  baseUrl: varchar("baseUrl", { length: 500 }),
  /** chave da API — NUNCA devolver ao cliente (apenas últimos 4 dígitos) */
  apiKey: text("apiKey"),
  /** id do modelo, ex.: "claude-sonnet-5-5" */
  model: varchar("model", { length: 160 }).notNull(),
  /** ordem na cadeia de failover (menor = primeiro) */
  priority: int("priority").default(10).notNull(),
  /** aceita entrada de imagem (transcrição de fotos/prints) */
  vision: boolean("vision").default(false).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  /** diagnóstico do último teste */
  lastTestAt: timestamp("lastTestAt"),
  lastTestOk: boolean("lastTestOk"),
  lastTestMsg: varchar("lastTestMsg", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiProvider = typeof aiProviders.$inferSelect;
