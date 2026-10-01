import { useMemo, useState } from "react";
import ProDialog from "@/components/plan/ProDialog";
import { usePlan } from "@/hooks/usePlan";
import { MAX_FLASHCARDS } from "@contracts/plans";
import { Lock, Crown } from "lucide-react";
import {
  Layers,
  Sparkles,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function FlashcardsTab({ subjectId }: { subjectId: number }) {
  const utils = trpc.useUtils();
  const [genOpen, setGenOpen] = useState(false);
  const [count, setCount] = useState(15);
  const plan = usePlan();
  const maxCards = plan.data?.limits.maxFlashcards ?? 15;
  const [proHint, setProHint] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [replace, setReplace] = useState(false);
  const [deck, setDeck] = useState<number[] | null>(null); // índices embaralhados
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const { data: cards, isLoading } = trpc.study.listFlashcards.useQuery({ subjectId });

  const generate = trpc.study.generateFlashcards.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.count} flashcards criados`);
      setGenOpen(false);
      setDeck(null);
      setPos(0);
      utils.study.listFlashcards.invalidate({ subjectId });
      utils.subjects.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const setMastery = trpc.study.setMastery.useMutation({
    onSuccess: () => utils.study.listFlashcards.invalidate({ subjectId }),
  });

  const order = useMemo(() => {
    if (!cards) return [];
    return deck ?? cards.map((_, i) => i);
  }, [cards, deck]);

  const current = cards && order.length ? cards[order[pos]] : null;
  const stats = useMemo(() => {
    if (!cards) return { novo: 0, aprendendo: 0, dominado: 0 };
    return {
      novo: cards.filter((c) => c.mastery === 0).length,
      aprendendo: cards.filter((c) => c.mastery === 1).length,
      dominado: cards.filter((c) => c.mastery === 2).length,
    };
  }, [cards]);

  function shuffleDeck() {
    if (!cards) return;
    const idx = cards.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setDeck(idx);
    setPos(0);
    setFlipped(false);
  }

  function mark(mastery: number) {
    if (!current) return;
    setMastery.mutate({ id: current.id, mastery });
    if (pos < order.length - 1) {
      setPos(pos + 1);
      setFlipped(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-muted-foreground">
          {cards?.length
            ? `${cards.length} cartões — ${stats.dominado} dominados, ${stats.aprendendo} em aprendizado`
            : "Cartões de revisão gerados pela IA a partir dos seus materiais."}
        </p>
        <div className="flex gap-2">
          {cards && cards.length > 1 && (
            <Button variant="outline" size="sm" onClick={shuffleDeck}>
              <Shuffle className="mr-1.5 h-3.5 w-3.5" /> Embaralhar
            </Button>
          )}
          <Button size="sm" onClick={() => setGenOpen(true)}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Gerar flashcards
          </Button>
        </div>
      </div>

      {generate.isPending && (
        <div className="rounded-lg border bg-card p-6 mb-4 space-y-3">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Criando {count} flashcards…
          </p>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : current ? (
        <div>
          <div className="flip-scene h-72 sm:h-80">
            <div
              className={`flip-inner ${flipped ? "flipped" : ""}`}
              onClick={() => setFlipped((f) => !f)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && setFlipped((f) => !f)}
              aria-label="Virar cartão"
            >
              <div className="flip-face">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                  Pergunta — toque para virar
                </span>
                <p className="font-display font-bold text-xl leading-snug">
                  {current.front}
                </p>
              </div>
              <div className="flip-face flip-back" style={{ borderColor: "var(--stain)" }}>
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--stain-ink)] mb-3">
                  Resposta
                </span>
                <p className="text-base leading-relaxed">{current.back}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={pos === 0}
              onClick={() => {
                setPos(pos - 1);
                setFlipped(false);
              }}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              {pos + 1} / {order.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pos >= order.length - 1}
              onClick={() => {
                setPos(pos + 1);
                setFlipped(false);
              }}
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => mark(0)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Não sei
            </Button>
            <Button variant="outline" size="sm" onClick={() => mark(1)}>
              Quase lá
            </Button>
            <Button size="sm" onClick={() => mark(2)}>
              Dominei
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <Layers className="mx-auto h-8 w-8 mb-3 opacity-50" />
          <p className="text-sm">
            Nenhum flashcard ainda. Clique em <strong>"Gerar flashcards"</strong> para
            criar um baralho a partir dos materiais.
          </p>
        </div>
      )}

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Gerar flashcards</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-5">
            <div>
              <label className="text-sm font-semibold">
                Quantidade: <span className="text-primary">{count}</span>
              </label>
              <Slider
                className="mt-4"
                min={5}
                max={MAX_FLASHCARDS}
                step={5}
                value={[count]}
                onValueChange={([v]) => {
                  if (v > maxCards) {
                    setCount(maxCards);
                    setProHint(true);
                  } else setCount(v);
                }}
              />
              {!plan.isPro && (
                <>
                  <div className="relative mt-1 h-5 text-[11px] text-muted-foreground">
                    <span className="absolute left-0">5</span>
                    <span
                      className="absolute -translate-x-1/2"
                      style={{ left: `${((maxCards - 5) / (MAX_FLASHCARDS - 5)) * 100}%` }}
                    >
                      {maxCards}
                    </span>
                    <span className="absolute right-0 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                      <Lock className="h-3 w-3" /> {MAX_FLASHCARDS} PRO
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProOpen(true)}
                    className={`mt-3 w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      proHint ? "border-amber-500/60 bg-amber-500/10" : "bg-muted/40"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                      <Crown className="h-3.5 w-3.5" /> Até {MAX_FLASHCARDS} flashcards por vez com o PRO
                    </span>
                    <span className="block text-muted-foreground mt-0.5">
                      No plano Gratuito: até {maxCards} por vez
                      {plan.generationsLeft !== null &&
                        ` · restam ${plan.generationsLeft} de ${plan.data?.limits.maxGenerationsPerMonth} gerações este mês`}
                      .
                    </span>
                  </button>
                </>
              )}
            </div>
            {!!cards?.length && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Substituir os {cards.length} cartões atuais</span>
                <Switch checked={replace} onCheckedChange={setReplace} />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => generate.mutate({ subjectId, count: Math.min(count, maxCards), replace })}
              disabled={generate.isPending || plan.generationsLeft === 0}
            >
              {generate.isPending ? "Gerando…" : plan.generationsLeft === 0 ? "Limite do mês atingido" : "Gerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProDialog open={proOpen} onOpenChange={setProOpen} />
    </div>
  );
}
