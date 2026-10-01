import { useState } from "react";
import { HelpCircle, Sparkles, Play, Trash2, History, Lock, Crown } from "lucide-react";
import { MAX_QUIZ_QUESTIONS } from "@contracts/plans";
import { usePlan } from "@/hooks/usePlan";
import ProDialog from "@/components/plan/ProDialog";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import QuizRunner from "@/components/study/QuizRunner";

export default function QuizTab({ subjectId }: { subjectId: number }) {
  const utils = trpc.useUtils();
  const [genOpen, setGenOpen] = useState(false);
  const [count, setCount] = useState(10);
  const plan = usePlan();
  const maxForPlan = plan.data?.limits.maxQuizQuestions ?? 25;
  const [proHint, setProHint] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<number | null>(null);

  const { data: quizList, isLoading } = trpc.study.listQuizzes.useQuery({ subjectId });
  const active = trpc.study.getQuiz.useQuery(
    { quizId: activeQuiz! },
    { enabled: activeQuiz !== null },
  );

  const generate = trpc.study.generateQuiz.useMutation({
    onSuccess: (r) => {
      toast.success(`Quiz criado com ${r.count} questões`);
      setGenOpen(false);
      utils.study.listQuizzes.invalidate({ subjectId });
      utils.subjects.list.invalidate();
      setActiveQuiz(r.quizId);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteQuiz = trpc.study.deleteQuiz.useMutation({
    onSuccess: () => {
      toast.success("Quiz excluído");
      utils.study.listQuizzes.invalidate({ subjectId });
      utils.subjects.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  /* ----- Runner em tela cheia da aba ----- */
  if (activeQuiz !== null) {
    if (active.isLoading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      );
    }
    if (!active.data) {
      setActiveQuiz(null);
      return null;
    }
    return (
      <QuizRunner
        quizId={activeQuiz}
        questions={active.data.questions}
        onExit={() => setActiveQuiz(null)}
        onSubmitted={() => utils.study.listQuizzes.invalidate({ subjectId })}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-muted-foreground">
          Gere um quiz a partir dos materiais e treine com explicação a cada questão.
        </p>
        <Button onClick={() => setGenOpen(true)}>
          <Sparkles className="mr-2 h-4 w-4" /> Gerar quiz com IA
        </Button>
      </div>

      {generate.isPending && (
        <div className="rounded-lg border bg-card p-6 mb-4 space-y-3">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Criando {count} questões sobre o material — pode levar até 1 minuto…
          </p>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : quizList?.length ? (
        <div className="space-y-3">
          {quizList.map((q) => (
            <div key={q.id} className="slide-card">
              <div className="slide-label">{q.questionCount} questões</div>
              <div className="slide-body">
                <div className="flex items-start justify-between gap-2 pr-9">
                  <div>
                    <h3 className="font-display font-bold text-lg leading-tight">
                      {q.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(q.createdAt).toLocaleDateString("pt-BR")}
                      {q.topics.length > 0 && ` · ${q.topics.slice(0, 4).join(", ")}${q.topics.length > 4 ? "…" : ""}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => setActiveQuiz(q.id)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Resolver
                  </Button>
                  {q.bestScore !== null && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <History className="h-3.5 w-3.5" />
                      melhor: {Math.round(q.bestScore * 100)}% ({q.attemptCount}x)
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive"
                    title="Excluir quiz"
                    onClick={() => setToDelete(q.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <HelpCircle className="mx-auto h-8 w-8 mb-3 opacity-50" />
          <p className="text-sm">
            Nenhum quiz ainda. Clique em <strong>"Gerar quiz com IA"</strong> para
            criar o primeiro a partir dos seus materiais.
          </p>
        </div>
      )}

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Gerar novo quiz</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-semibold">
              Quantidade de questões: <span className="text-primary">{count}</span>
            </label>
            <Slider
              className="mt-4"
              min={5}
              max={MAX_QUIZ_QUESTIONS}
              step={5}
              value={[count]}
              onValueChange={([v]) => {
                if (v > maxForPlan) {
                  setCount(maxForPlan);
                  setProHint(true);
                } else {
                  setCount(v);
                }
              }}
            />
            {!plan.isPro && (
              <div className="relative mt-1 h-5 text-[11px] text-muted-foreground">
                <span className="absolute left-0">5</span>
                <span
                  className="absolute -translate-x-1/2"
                  style={{ left: `${((maxForPlan - 5) / (MAX_QUIZ_QUESTIONS - 5)) * 100}%` }}
                >
                  {maxForPlan}
                </span>
                <span className="absolute right-0 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                  <Lock className="h-3 w-3" /> {MAX_QUIZ_QUESTIONS} PRO
                </span>
              </div>
            )}
            {!plan.isPro && (
              <button
                type="button"
                onClick={() => setProOpen(true)}
                className={`mt-3 w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  proHint ? "border-amber-500/60 bg-amber-500/10" : "bg-muted/40"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                  <Crown className="h-3.5 w-3.5" /> Até {MAX_QUIZ_QUESTIONS} questões por quiz com o PRO
                </span>
                <span className="block text-muted-foreground mt-0.5">
                  No plano Gratuito: até {maxForPlan} questões
                  {plan.generationsLeft !== null &&
                    ` · restam ${plan.generationsLeft} de ${plan.data?.limits.maxGenerationsPerMonth} gerações este mês`}
                  .
                </span>
              </button>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              A IA usa todos os materiais prontos da matéria. Quanto mais material,
              melhores as questões.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => generate.mutate({ subjectId, count })}
              disabled={generate.isPending || plan.generationsLeft === 0}
            >
              {generate.isPending
                ? "Gerando…"
                : plan.generationsLeft === 0
                  ? "Limite do mês atingido"
                  : "Gerar quiz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProDialog open={proOpen} onOpenChange={setProOpen} />

      <AlertDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              As questões e o histórico de tentativas serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteQuiz.mutate({ quizId: toDelete })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
