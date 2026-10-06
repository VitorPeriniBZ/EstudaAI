import { Activity, RefreshCw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";

const KIND_STYLE: Record<string, string> = {
  "todas falharam": "bg-destructive/15 text-destructive",
  falhou: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "plano B": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

/** Quadro "Últimas falhas das IAs" do painel admin. */
export default function AiEvents() {
  const { data, refetch, isFetching } = trpc.admin.recentAiEvents.useQuery(undefined, { refetchInterval: 30_000 });
  return (
    <section className="mt-8 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Últimas falhas das IAs
        </h2>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        O que cada IA respondeu quando falhou. “Plano B” = a IA errou o formato estruturado e o app pediu o
        JSON em texto (o aluno não percebe). Some quando o servidor reinicia.
      </p>
      {!data?.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma falha registrada desde o último reinício. 🎉</p>
      ) : (
        <ul className="mt-3 divide-y">
          {data.map((e, i) => (
            <li key={i} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_STYLE[e.kind] ?? ""}`}>{e.kind}</span>
                <span className="font-semibold">{e.provider}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground break-words">{e.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
