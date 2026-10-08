import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { plural } from "@/lib/plural";
import { ArrowLeft, FileUp, BookOpen, HelpCircle, Layers, MessageCircleQuestion, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
import SubjectDialog from "@/components/SubjectDialog";
import { stainClass, stainStyle } from "@/lib/study";
import { isHexColor } from "@/lib/color";
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
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = trpc.subjects.remove.useMutation({
    onSuccess: () => {
      toast.success("Matéria excluída");
      // tira do cache antes de voltar, para o cartão não aparecer por um instante no painel
      utils.subjects.list.setData(undefined, (old) => old?.filter((s) => s.id !== subjectId));
      utils.subjects.list.invalidate();
      navigate("/app");
    },
    onError: (e) => toast.error(e.message),
  });

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
    <div className={`min-h-screen ${stainClass(subject.color)}`} style={stainStyle(subject.color)}>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Minhas matérias
          </button>
          {/* ações da matéria: aqui em cima o título fica com a largura toda no celular */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Editar matéria"
              title="Editar matéria"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setEditKey((k) => k + 1); // reabre com os dados atuais
                setEditOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Excluir matéria"
              title="Excluir matéria"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

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

      <SubjectDialog
        key={editKey}
        open={editOpen}
        onOpenChange={setEditOpen}
        subject={subject}
        savedColors={[...new Set((subjects ?? []).map((s) => s.color).filter(isHexColor))]}
        onSaved={() => {
          utils.subjects.list.invalidate();
          utils.subjects.get.invalidate({ id: subject.id });
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir matéria?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga "{subject.name}" junto com materiais, quizzes, flashcards e
              conversas. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate({ id: subject.id })}
              disabled={remove.isPending}
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
