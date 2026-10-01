export const Session = {
  cookieName: "estudaai_sid",
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 dias
} as const;

export const ErrorMessages = {
  unauthenticated: "Faça login para continuar",
  insufficientRole: "Você não tem acesso a esta página.",
} as const;

export const Paths = {
  login: "/login",
  googleStart: "/api/auth/google",
  googleCallback: "/api/auth/google/callback",
} as const;
