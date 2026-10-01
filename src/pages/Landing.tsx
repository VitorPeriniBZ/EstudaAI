import { useEffect } from "react";
import { useNavigate } from "react-router";
import { FileUp, Sparkles, Layers, MessageCircleQuestion, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Logo } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

const STEPS = [
  {
    icon: FileUp,
    title: "Envie seus materiais",
    text: "PDFs dos slides, fotos da lousa, anotações — a plataforma lê tudo e extrai o conteúdo.",
  },
  {
    icon: Sparkles,
    title: "A IA monta seu estudo",
    text: "Resumo organizado, quiz com explicações e flashcards, tudo gerado a partir do SEU material.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Tire dúvidas no chat",
    text: "Um tutor que conhece a sua matéria responde perguntas com base no que você enviou.",
  },
];

export default function Landing() {
  const { user, isLoading } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) navigate("/app", { replace: true });
  }, [isLoading, user, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => navigate("/login")}>Entrar</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-10 text-center">
          <div className="slide-card stain-hema mx-auto max-w-md text-left mb-10">
            <div className="slide-label">sua prova, sem susto</div>
            <div className="slide-body">
              <p className="font-display font-bold text-lg leading-snug pr-10">
                De pilha de PDF a quiz pronto em minutos
              </p>
              <p className="text-sm text-muted-foreground pr-10">
                Resumo + questões + flashcards + tutor
              </p>
            </div>
          </div>

          <h1 className="font-display font-extrabold text-4xl sm:text-5xl leading-[1.08] tracking-tight">
            Estude o que o professor
            <br className="hidden sm:block" /> passou, <span className="text-primary">de verdade</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            O EstudaAí transforma os materiais da sua disciplina em quiz,
            resumo e flashcards com IA — e ainda tira suas dúvidas no chat.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/login")}>
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className={`slide-card stain-${["hema", "giemsa", "lugol"][i]}`}
              >
                <div className="slide-label">passo {i + 1}</div>
                <div className="slide-body">
                  <s.icon className="h-5 w-5 mb-2 text-[var(--stain-ink)]" />
                  <h2 className="font-display font-bold text-base leading-tight pr-8">
                    {s.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1 pr-8">
                    {s.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-lg border bg-card p-5 flex items-start gap-3">
            <Layers className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              Feito para universitários: cada matéria fica organizada no seu
              painel, com histórico de quizzes, revisão das questões erradas e
              progresso nos flashcards. Entre com sua conta e seus estudos ficam
              salvos em qualquer dispositivo.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <p className="text-center text-xs text-muted-foreground">
          EstudaAí — estude com o seu próprio material. ·{" "}
          <a href="/privacidade" className="underline">Privacidade</a> ·{" "}
          <a href="/termos" className="underline">Termos de uso</a>
        </p>
      </footer>
    </div>
  );
}
