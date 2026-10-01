import { useState } from "react";
import { Crown, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/usePlan";
import ProDialog from "./ProDialog";

function Meter({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
      <div
        className={`h-full transition-all ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Cartão de plano e uso do mês (dashboard). */
export default function PlanCard() {
  const { data, isPro } = usePlan();
  const [open, setOpen] = useState(false);
  if (!data) return null;

  if (isPro) {
    return (
      <div className="mt-6 rounded-lg border bg-card px-4 py-3 flex items-center gap-2 text-sm">
        <Crown className="h-4 w-4 text-amber-500" />
        <span className="font-semibold">Plano PRO</span>
        <span className="text-muted-foreground">· arquivos, gerações, resumos e chat sem limite · quiz até {data.limits.maxQuizQuestions} questões · flashcards até {data.limits.maxFlashcards}</span>
      </div>
    );
  }

  const resets = new Date(data.resetsAt).toLocaleDateString("pt-BR");
  return (
    <div className="mt-6 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm">
          <span className="font-semibold">Plano Gratuito</span>
          <span className="text-muted-foreground"> · renova em {resets}</span>
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Crown className="h-4 w-4 text-amber-500" /> Conhecer o PRO
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Gerações com IA este mês:{" "}
            <strong className="text-foreground">
              {data.usage.generations} de {data.limits.maxGenerationsPerMonth}
            </strong>
          </p>
          <Meter used={data.usage.generations} max={data.limits.maxGenerationsPerMonth ?? 1} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <FileText className="h-3.5 w-3.5" /> Arquivos enviados:{" "}
            <strong className="text-foreground">
              {data.usage.files} de {data.limits.maxFiles}
            </strong>
          </p>
          <Meter used={data.usage.files} max={data.limits.maxFiles ?? 1} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Hoje: <strong className="text-foreground">{data.usage.summariesToday} de {data.limits.maxSummariesPerDay}</strong> resumos ·{" "}
        <strong className="text-foreground">{data.usage.chatToday} de {data.limits.maxChatPerDay}</strong> perguntas no chat ·
        flashcards até {data.limits.maxFlashcards} por vez · quiz até {data.limits.maxQuizQuestions} questões
      </p>
      <ProDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
