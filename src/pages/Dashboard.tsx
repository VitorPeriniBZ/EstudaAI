import { useState } from "react";
import { plural } from "@/lib/plural";
import PlanCard from "@/components/plan/PlanCard";
import { useNavigate } from "react-router";
import { Plus, FileText, HelpCircle, Layers } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import SubjectDialog from "@/components/SubjectDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { stainClass, stainStyle } from "@/lib/study";
import { isHexColor } from "@/lib/color";

export default function Dashboard() {
  const { isLoading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: subjects, isLoading } = trpc.subjects.list.useQuery(undefined, {
    enabled: !authLoading,
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-extrabold text-3xl tracking-tight">
              Minhas matérias
            </h1>
            <p className="text-muted-foreground mt-1">
              Envie os materiais de cada disciplina e gere quiz, resumo e
              flashcards com IA.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova matéria
          </Button>
        </div>
        <PlanCard />

        {isLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : !subjects?.length ? (
          <div className="mt-10 rounded-lg border bg-card p-10 text-center">
            <div className="slide-card stain-giemsa max-w-sm mx-auto text-left mb-6">
              <div className="slide-label">primeira matéria</div>
              <div className="slide-body">
                <p className="font-display font-bold">Comece por aqui</p>
                <p className="text-sm text-muted-foreground">
                  Crie uma matéria e envie os PDFs da aula
                </p>
              </div>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Criar minha primeira matéria
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {subjects.map((s) => (
              <div key={s.id} className={`slide-card ${stainClass(s.color)} group`} style={stainStyle(s.color)}>
                <div className="slide-label">{plural(s.counts.questions, "questão", "questões")}</div>
                <div className="slide-body relative">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display font-bold text-xl leading-tight min-w-0 break-words">
                      {/* o link cobre o cartão inteiro (área de clique grande, um único foco) */}
                      <button
                        className="text-left after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded"
                        onClick={() => navigate(`/app/materia/${s.id}`)}
                      >
                        {s.name}
                      </button>
                    </h2>
                  </div>
                  {s.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {plural(s.counts.materials, "material", "materiais")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle className="h-3.5 w-3.5" />
                      {plural(s.counts.quizzes, "quiz", "quizzes")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {plural(s.counts.flashcards, "flashcard", "flashcards")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <SubjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        savedColors={[...new Set((subjects ?? []).map((s) => s.color).filter(isHexColor))]}
        onSaved={(id) => {
          utils.subjects.list.invalidate();
          navigate(`/app/materia/${id}`);
        }}
      />
    </div>
  );
}
