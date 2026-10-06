import { useParams, useNavigate } from "react-router";
import { plural } from "@/lib/plural";
import { ArrowLeft, FileUp, BookOpen, HelpCircle, Layers, MessageCircleQuestion } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { stainClass } from "@/lib/study";
import MaterialsTab from "@/components/study/MaterialsTab";
import SummaryTab from "@/components/study/SummaryTab";
import QuizTab from "@/components/study/QuizTab";
import FlashcardsTab from "@/components/study/FlashcardsTab";
import ChatTab from "@/components/study/ChatTab";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const subjectId = Number(id);
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth({ redirectOnUnauthenticated: true });

  const { data: subjects, isLoading } = trpc.subjects.list.useQuery(undefined, {
    enabled: !authLoading,
  });
  const subject = subjects?.find((s) => s.id === subjectId);

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-8 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
        </main>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Matéria não encontrada.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${stainClass(subject.color)}`}>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-20">
        <button
          onClick={() => navigate("/app")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Minhas matérias
        </button>

        <div className="slide-card mb-6">
          <div className="slide-label">{plural(subject.counts.questions, "questão gerada", "questões geradas")}</div>
          <div className="slide-body">
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl leading-tight">
              {subject.name}
            </h1>
            {subject.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {subject.description}
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="materiais">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
            <TabsTrigger value="materiais" className="gap-1.5">
              <FileUp className="h-4 w-4" /> Materiais
            </TabsTrigger>
            <TabsTrigger value="resumo" className="gap-1.5">
              <BookOpen className="h-4 w-4" /> Resumo
            </TabsTrigger>
            <TabsTrigger value="quiz" className="gap-1.5">
              <HelpCircle className="h-4 w-4" /> Quiz
            </TabsTrigger>
            <TabsTrigger value="flashcards" className="gap-1.5">
              <Layers className="h-4 w-4" /> Flashcards
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageCircleQuestion className="h-4 w-4" /> Dúvidas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="materiais" className="mt-5">
            <MaterialsTab subjectId={subjectId} />
          </TabsContent>
          <TabsContent value="resumo" className="mt-5">
            <SummaryTab subjectId={subjectId} />
          </TabsContent>
          <TabsContent value="quiz" className="mt-5">
            <QuizTab subjectId={subjectId} />
          </TabsContent>
          <TabsContent value="flashcards" className="mt-5">
            <FlashcardsTab subjectId={subjectId} />
          </TabsContent>
          <TabsContent value="chat" className="mt-5">
            <ChatTab subjectId={subjectId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
