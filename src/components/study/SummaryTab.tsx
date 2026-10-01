import { BookOpen, RefreshCw, Sparkles } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Markdown from "@/components/Markdown";
import { toast } from "sonner";

export default function SummaryTab({ subjectId }: { subjectId: number }) {
  const utils = trpc.useUtils();
  const { data: subjects, isLoading } = trpc.subjects.list.useQuery();
  const subject = subjects?.find((s) => s.id === subjectId);

  const plan = usePlan();
  const summariesLeft =
    plan.data && plan.data.limits.maxSummariesPerDay !== null
      ? Math.max(0, plan.data.limits.maxSummariesPerDay - plan.data.usage.summariesToday)
      : null;
  const generate = trpc.study.generateSummary.useMutation({
    onSuccess: () => {
      toast.success("Resumo gerado");
      utils.subjects.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }

  const hasSummary = !!subject?.summary;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-muted-foreground">
          {hasSummary
            ? `Gerado ${subject?.summaryAt ? new Date(subject.summaryAt).toLocaleString("pt-BR") : ""} a partir dos materiais enviados.`
            : "A IA lê todos os materiais prontos e escreve um resumo organizado por temas."}
        </p>
        <div className="flex flex-col items-end gap-1">
        <Button
          onClick={() => generate.mutate({ subjectId })}
          disabled={generate.isPending || summariesLeft === 0 || plan.generationsLeft === 0}
          variant={hasSummary ? "outline" : "default"}
        >
          {generate.isPending ? (
            <>Gerando resumo…</>
          ) : hasSummary ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" /> Gerar novamente
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Gerar resumo com IA
            </>
          )}
        </Button>
        {summariesLeft !== null && (
          <span className={`text-xs ${summariesLeft === 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
            {summariesLeft === 0
              ? "Limite de resumos de hoje atingido · ilimitado no PRO"
              : `Plano Gratuito: ${summariesLeft} de ${plan.data?.limits.maxSummariesPerDay} resumos restantes hoje`}
          </span>
        )}
        </div>
      </div>

      {generate.isPending && (
        <div className="space-y-3 rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Lendo os materiais e escrevendo o resumo — pode levar até 1 minuto…
          </p>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}

      {!generate.isPending && hasSummary && (
        <article className="rounded-lg border bg-card p-5 sm:p-7">
          <Markdown>{subject!.summary!}</Markdown>
        </article>
      )}

      {!generate.isPending && !hasSummary && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <BookOpen className="mx-auto h-8 w-8 mb-3 opacity-50" />
          <p className="text-sm">
            Nenhum resumo ainda. Envie materiais na aba <strong>Materiais</strong> e
            clique em "Gerar resumo com IA".
          </p>
        </div>
      )}
    </div>
  );
}
