import { useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Trash2, FileText, HelpCircle, Layers } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  STAINS,
  STAIN_SWATCH,
  STAIN_LABELS,
  stainClass,
  type Stain,
} from "@/lib/study";

function SubjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<Stain>("hema");
  const create = trpc.subjects.create.useMutation({
    onSuccess: (s) => {
      onOpenChange(false);
      setName("");
      setDescription("");
      setColor("hema");
      if (s?.id) onCreated(s.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Nova matéria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold" htmlFor="sub-name">
              Nome da matéria
            </label>
            <Input
              id="sub-name"
              placeholder="Ex.: Parasitologia"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="sub-desc">
              Descrição (opcional)
            </label>
            <Textarea
              id="sub-desc"
              placeholder="Ex.: 8 aulas da Profa. Lívia — prova dia 20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <span className="text-sm font-semibold">Cor da matéria</span>
            <div className="mt-2 flex gap-2">
              {STAINS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={STAIN_LABELS[c]}
                  onClick={() => setColor(c)}
                  className="h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    backgroundColor: STAIN_SWATCH[c],
                    borderColor:
                      color === c ? "hsl(var(--foreground))" : "transparent",
                  }}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              create.mutate({ name: name.trim(), description: description.trim() || undefined, color })
            }
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Criando…" : "Criar matéria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { isLoading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: subjects, isLoading } = trpc.subjects.list.useQuery(undefined, {
    enabled: !authLoading,
  });
  const remove = trpc.subjects.remove.useMutation({
    onSuccess: () => {
      toast.success("Matéria excluída");
      utils.subjects.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
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
                <p className="font-display font-bold pr-8">Comece por aqui</p>
                <p className="text-sm text-muted-foreground pr-8">
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
              <div key={s.id} className={`slide-card ${stainClass(s.color)} group`}>
                <div className="slide-label">{s.counts.questions} questões</div>
                <button
                  className="slide-body text-left w-full focus:outline-none"
                  onClick={() => navigate(`/app/materia/${s.id}`)}
                >
                  <div className="flex items-start justify-between gap-2 pr-9">
                    <h2 className="font-display font-bold text-xl leading-tight">
                      {s.name}
                    </h2>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Excluir ${s.name}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 -m-1 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(s.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          setToDelete(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 pr-8">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pr-8">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {s.counts.materials} material(is)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle className="h-3.5 w-3.5" />
                      {s.counts.quizzes} quiz(zes)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {s.counts.flashcards} flashcards
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <SubjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => {
          utils.subjects.list.invalidate();
          navigate(`/app/materia/${id}`);
        }}
      />

      <AlertDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir matéria?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga a matéria junto com materiais, quizzes, flashcards e
              conversas. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && remove.mutate({ id: toDelete })}
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
