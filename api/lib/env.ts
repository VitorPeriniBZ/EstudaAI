import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value && isProduction) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value ?? "";
}

export const env = {
  isProduction,
  /** Segredo para assinar o JWT de sessão (gere um valor aleatório longo) */
  appSecret: required("APP_SECRET"),
  /** String de conexão do PostgreSQL */
  databaseUrl: required("DATABASE_URL"),
  /** Credenciais OAuth do Google (Google Cloud Console → Credenciais) */
  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
  /**
   * URL pública do site (sem barra no final). No Render, RENDER_EXTERNAL_URL
   * é preenchida automaticamente; APP_URL tem prioridade se você usar domínio próprio.
   */
  appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, ""),
  /** E-mails que sempre viram admin (opcional, separados por vírgula) */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** Chave da Anthropic para cadastrar o provedor de IA no primeiro start (opcional) */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
};
