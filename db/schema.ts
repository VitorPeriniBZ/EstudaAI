import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  customType,
  index,
} from "drizzle-orm/pg-core";

/** bytea ↔ Buffer (drizzle não tem helper nativo para bytea) */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const userPlan = pgEnum("user_plan", ["free", "pro"]);
export const materialKind = pgEnum("material_kind", ["pdf", "image", "note"]);
export const materialStatus = pgEnum("material_status", ["processing", "ready", "error"]);
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);
export const aiProviderType = pgEnum("ai_provider_type", ["anthropic", "openai", "google"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** "sub" do Google — identificador estável da conta */
  googleSub: varchar("googleSub", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: userRole("role").default("user").notNull(),
  /** plano de assinatura (admin sempre tem acesso completo) */
  plan: userPlan("plan").default("free").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Uso de IA por usuário (uma linha por geração bem-sucedida).
 * Serve para os limites mensais do plano e para o painel admin.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    /** "quiz" | "summary" | "flashcards" */
    kind: varchar("kind", { length: 32 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("usage_user_created_idx").on(t.userId, t.createdAt)],
);

// ---------- EstudaAí ----------

/** Matéria/disciplina do estudante (ex.: "Parasitologia") */
export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    /** chave da cor ("giemsa" | "lugol" | "hema" | "madder" | "neutral") */
    color: varchar("color", { length: 24 }).default("hema").notNull(),
    /** resumo gerado por IA (markdown) */
    summary: text("summary"),
    summaryAt: timestamp("summaryAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("subjects_user_idx").on(t.userId)],
);

export type Subject = typeof subjects.$inferSelect;

/**
 * Arquivos enviados (PDF/imagem), guardados no próprio Postgres.
 * Os bytes ficam aqui; `materials.fileKey` guarda o id desta tabela.
 */
export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 120 }).notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("files_user_idx").on(t.userId)],
);

export type StoredFile = typeof files.$inferSelect;

/** Material enviado: pdf, imagem ou anotação digitada */
export const materials = pgTable(
  "materials",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subjectId").notNull(),
    userId: integer("userId").notNull(),
    kind: materialKind("kind").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    /** id do arquivo na tabela `files` (pdf/imagem); null para notas */
    fileKey: varchar("fileKey", { length: 512 }),
    fileSize: integer("fileSize"),
    /** texto extraído do arquivo ou conteúdo da nota */
    textContent: text("textContent"),
    status: materialStatus("status").default("processing").notNull(),
    statusMsg: varchar("statusMsg", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("materials_subject_idx").on(t.subjectId)],
);

export type Material = typeof materials.$inferSelect;

/** Quiz gerado por IA a partir dos materiais da matéria */
export const quizzes = pgTable(
  "quizzes",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subjectId").notNull(),
    userId: integer("userId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("quizzes_subject_idx").on(t.subjectId)],
);

export type Quiz = typeof quizzes.$inferSelect;

export type QuestionOption = string;

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    quizId: integer("quizId").notNull(),
    subjectId: integer("subjectId").notNull(),
    topic: varchar("topic", { length: 160 }).default("Geral").notNull(),
    text: text("text").notNull(),
    options: jsonb("options").$type<QuestionOption[]>().notNull(),
    answerIndex: integer("answerIndex").notNull(),
    explanation: text("explanation").notNull(),
  },
  (t) => [index("questions_quiz_idx").on(t.quizId), index("questions_subject_idx").on(t.subjectId)],
);

export type Question = typeof questions.$inferSelect;

/** Tentativa de quiz (para progresso e "revisar erradas") */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    quizId: integer("quizId").notNull(),
    subjectId: integer("subjectId").notNull(),
    userId: integer("userId").notNull(),
    total: integer("total").notNull(),
    correct: integer("correct").notNull(),
    wrongQuestionIds: jsonb("wrongQuestionIds").$type<number[]>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("attempts_quiz_idx").on(t.quizId)],
);

export type QuizAttempt = typeof quizAttempts.$inferSelect;

/** Flashcards gerados por IA */
export const flashcards = pgTable(
  "flashcards",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subjectId").notNull(),
    userId: integer("userId").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    /** marcação simples de domínio: 0 novo, 1 aprendendo, 2 dominado */
    mastery: integer("mastery").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("flashcards_subject_idx").on(t.subjectId)],
);

export type Flashcard = typeof flashcards.$inferSelect;

/** Histórico do chat de dúvidas por matéria */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subjectId").notNull(),
    userId: integer("userId").notNull(),
    role: chatRole("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("chat_subject_idx").on(t.subjectId)],
);

export type ChatMessage = typeof chatMessages.$inferSelect;

/**
 * Provedores de IA configuráveis pelo admin (dono do site).
 * Cadeia de failover: usa o de menor `priority` primeiro; se esgotar quota,
 * a chave falhar ou der erro transitório, cai para o próximo.
 */
export const aiProviders = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  /** rótulo amigável, ex.: "Anthropic — Claude Sonnet 5" */
  name: varchar("name", { length: 160 }).notNull(),
  /**
   * anthropic  → @ai-sdk/anthropic (baseUrl opcional)
   * openai     → qualquer endpoint OpenAI-compatível (baseUrl opcional; padrão api.openai.com)
   * google     → Google Gemini nativo via @ai-sdk/google (chave do AI Studio)
   */
  type: aiProviderType("type").notNull(),
  baseUrl: varchar("baseUrl", { length: 500 }),
  /** chave da API — NUNCA devolver ao cliente (apenas mascarada) */
  apiKey: text("apiKey"),
  /** id do modelo, ex.: "claude-sonnet-5" */
  model: varchar("model", { length: 160 }).notNull(),
  /** ordem na cadeia de failover (menor = primeiro) */
  priority: integer("priority").default(10).notNull(),
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
