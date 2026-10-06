import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Moon, Sun } from "lucide-react";
import { Logo } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

const ERRORS: Record<string, string> = {
  cancelado: "Login cancelado. Tente de novo quando quiser.",
  sessao_expirada: "A tentativa de login expirou. Clique em entrar novamente.",
  google_recusou: "O Google não autorizou o login. Tente novamente.",
  google_falhou: "Não foi possível concluir o login com o Google. Tente novamente.",
  google_nao_configurado:
    "O login está temporariamente indisponível. Tente novamente mais tarde.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login() {
  const { user, isLoading } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const error = params.get("erro");
  const next = params.get("next");

  useEffect(() => {
    if (!isLoading && user) navigate("/app", { replace: true });
  }, [isLoading, user, navigate]);

  const loginHref = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <a href="/" aria-label="Início">
            <Logo />
          </a>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="slide-card stain-hema">
            <div className="slide-label">entrar</div>
            <div className="slide-body">
              <h1 className="font-display font-extrabold text-2xl tracking-tight">
                Bem-vindo ao EstudaAí
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Use sua conta Google. Suas matérias e quizzes ficam salvos em
                qualquer dispositivo.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {ERRORS[error] ?? "Não foi possível entrar. Tente novamente."}
            </div>
          )}

          <Button asChild size="lg" variant="outline" className="mt-5 w-full gap-3 bg-card text-base">
            <a href={loginHref}>
              <GoogleIcon />
              Entrar com Google
            </a>
          </Button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Usamos só seu nome, e-mail e foto do Google para criar sua conta. Ao entrar, você
            concorda com os <a href="/termos" className="underline">Termos de uso</a> e a{" "}
            <a href="/privacidade" className="underline">Política de Privacidade</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
