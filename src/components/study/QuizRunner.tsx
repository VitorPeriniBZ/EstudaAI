import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import type { Question } from "@/lib/types";
import Celebration, { celebrate, celebratePerfect } from "@/components/study/Celebration";

type RunItem = {
  q: Question;
  /** ordem embaralhada das alternativas: order[posição exibida] = índice original */
  order: number[];
  correct: number; // posição exibida da alternativa correta
  chosen: number | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function QuizRunnerInner({
  quizId,
  questions,
  onExit,
  onSubmitted,
}: {
  quizId: number;
  questions: Question[];
  onExit: () => void;
  onSubmitted: () => void;
}) {
  const topics = useMemo(
    () => [...new Set(questions.map((q) => q.topic))],
    [questions],
  );
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(
    new Set(topics),
  );
  const [phase, setPhase] = useState<"setup" | "run" | "end">("setup");
  const [items, setItems] = useState<RunItem[]>([]);
  const [pos, setPos] = useState(0);
  const [hits, setHits] = useState(0);
  const [streak, setStreak] = useState(0);

  const submit = trpc.study.submitAttempt.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const filteredCount = questions.filter((q) => selectedTopics.has(q.topic)).length;

  function start(onlyQuestions?: Question[]) {
    const pool = onlyQuestions ?? questions.filter((q) => selectedTopics.has(q.topic));
    const run = shuffle(pool).map((q) => {
      const order = shuffle(q.options.map((_, i) => i));
      return { q, order, correct: order.indexOf(q.answerIndex), chosen: null };
    });
    setItems(run);
    setPos(0);
    setHits(0);
    setStreak(0);
    setPhase("run");
    window.scrollTo({ top: 0 });
  }

  function answer(k: number, el?: HTMLElement) {
    const it = items[pos];
    if (it.chosen !== null) return;
    const next = items.slice();
    next[pos] = { ...it, chosen: k };
    setItems(next);
    if (k === it.correct) {
      setHits((h) => h + 1);
      const s = streak + 1;
      setStreak(s);
      const r = el?.getBoundingClientRect();
      celebrate(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height / 2 : window.innerHeight / 2, s);
    } else {
      setStreak(0);
    }
  }

  function finish(runItems = items) {
    const answered = runItems.filter((x) => x.chosen !== null);
    const allRight =
      answered.length > 0 &&
      answered.length === runItems.length &&
      answered.every((x) => x.chosen === x.correct);
    if (allRight) setTimeout(() => celebratePerfect(), 150);
    if (answered.length > 0) {
      const answers: Record<string, number> = {};
      for (const it of answered) {
        // converte posição exibida → índice original da alternativa
        answers[String(it.q.id)] = it.order[it.chosen!];
      }
      submit.mutate(
        { quizId, answers },
        { onSuccess: () => onSubmitted() },
      );
    }
    setPhase("end");
    window.scrollTo({ top: 0 });
  }

  /* ---------- Tela de preparação ---------- */
  if (phase === "setup") {
    return (
      <div>
        <h3 className="font-display font-bold text-xl">Escolha os temas</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Uma questão por vez, com explicação a cada resposta.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            className="chip"
            aria-pressed={selectedTopics.size === topics.length}
            onClick={() =>
              setSelectedTopics(
                selectedTopics.size === topics.length
                  ? new Set()
                  : new Set(topics),
              )
            }
          >
            Todos
          </button>
          {topics.map((t) => (
            <button
              key={t}
              className="chip"
              aria-pressed={selectedTopics.has(t)}
              onClick={() => {
                const s = new Set(selectedTopics);
                if (s.has(t)) s.delete(t);
                else s.add(t);
                setSelectedTopics(s);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          {filteredCount
            ? `${filteredCount} questões selecionadas`
            : "Selecione pelo menos um tema"}
        </p>
        <div className="mt-4 flex gap-2 flex-wrap">
          <Button onClick={() => start()} disabled={!filteredCount}>
            Começar quiz
          </Button>
          <Button variant="outline" onClick={onExit}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- Tela de resultado ---------- */
  if (phase === "end") {
    const answered = items.filter((x) => x.chosen !== null);
    const wrong = answered.filter((x) => x.chosen !== x.correct);
    const pct = answered.length ? hits / answered.length : 0;
    return (
      <div>
        <h3 className="font-display font-bold text-xl flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> Resultado
        </h3>
        <p className="font-display font-extrabold text-6xl mt-4">
          {hits}
          <span className="text-2xl text-muted-foreground">/{answered.length}</span>
        </p>
        <p className="text-muted-foreground mt-2">
          {!answered.length
            ? "Nenhuma questão respondida."
            : pct >= 0.9
              ? "Excelente — você domina esse conteúdo."
              : pct >= 0.7
                ? "Bom resultado. Revise as erradas abaixo para fechar as lacunas."
                : "Vale reler o resumo dos temas abaixo e refazer as erradas."}
        </p>
        <div className="mt-5 flex gap-2 flex-wrap">
          {wrong.length > 0 && (
            <Button onClick={() => start(wrong.map((w) => w.q))}>
              Refazer as {wrong.length} errada(s)
            </Button>
          )}
          <Button variant="outline" onClick={() => setPhase("setup")}>
            Novo quiz
          </Button>
          <Button variant="ghost" onClick={onExit}>
            Voltar à lista
          </Button>
        </div>

        {wrong.length > 0 && (
          <div className="mt-8">
            <h4 className="font-display font-bold">Revisão das erradas</h4>
            <div className="divide-y mt-2">
              {wrong.map((w) => (
                <div key={w.q.id} className="py-3">
                  <p className="font-semibold text-sm">
                    <span className="text-[var(--stain-ink)]">{w.q.topic}:</span>{" "}
                    {w.q.text}
                  </p>
                  <p className="text-sm text-[#2F7A55] dark:text-[#6CC79A] font-semibold mt-1">
                    {w.q.options[w.q.answerIndex]}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {w.q.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------- Tela de questão ---------- */
  const it = items[pos];
  const q = it.q;
  return (
    <div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(pos / items.length) * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-sm text-muted-foreground">
        <span>
          Questão {pos + 1} de {items.length}
        </span>
        {streak >= 2 && (
          <span className="font-semibold text-amber-600 dark:text-amber-400">🔥 {streak} seguidas</span>
        )}
        <span>
          {hits} acerto{hits === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 rounded-lg border bg-card p-5">
        <p className="text-xs font-bold text-[var(--stain-ink)]">{q.topic}</p>
        <h3 className="font-bold text-lg leading-snug mt-1 mb-4">{q.text}</h3>
        <div className="grid gap-2">
          {it.order.map((oi, k) => {
            let cls = "";
            if (it.chosen !== null) {
              if (k === it.correct) cls = "opt-right";
              else if (k === it.chosen) cls = "opt-wrong";
              else cls = "opt-dim";
            }
            return (
              <button
                key={k}
                className={`opt-btn ${cls}`}
                disabled={it.chosen !== null}
                onClick={(e) => answer(k, e.currentTarget)}
              >
                <span className="opt-key">{"ABCD"[k]}</span>
                <span>{q.options[oi]}</span>
              </button>
            );
          })}
        </div>

        {it.chosen !== null && (
          <div className={`fb-box ${it.chosen === it.correct ? "fb-ok" : "fb-no"}`}>
            <strong className="block mb-0.5">
              {it.chosen === it.correct
                ? "Certo!"
                : `Resposta certa: ${q.options[q.answerIndex]}`}
            </strong>
            <span className="text-sm">{q.explanation}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        {it.chosen !== null && (
          <Button
            onClick={() => {
              if (pos < items.length - 1) {
                setPos(pos + 1);
                window.scrollTo({ top: 0 });
              } else {
                finish();
              }
            }}
            autoFocus
          >
            {pos === items.length - 1 ? "Ver resultado" : "Próxima"}
          </Button>
        )}
        <Button variant="outline" onClick={() => finish()}>
          Encerrar
        </Button>
      </div>
    </div>
  );
}

/** Camada de fogos única, acima de todas as telas do quiz. */
export default function QuizRunner(props: Parameters<typeof QuizRunnerInner>[0]) {
  return (
    <>
      <Celebration />
      <QuizRunnerInner {...props} />
    </>
  );
}
