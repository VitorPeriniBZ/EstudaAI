import { useState } from "react";
import { plural } from "@/lib/plural";
import PlanCard from "@/components/plan/PlanCard";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { toast } from "sonner";
import {
  STAINS,
  STAIN_LABELS,
  isStain,
  stainClass,
  stainStyle,
  swatchColor,
} from "@/lib/study";
import { isHexColor } from "@/lib/color";

const colorLabel = (c: string) => (isStain(c) ? STAIN_LABELS[c] : `Cor personalizada ${c}`);

function SubjectDialog({
  open,
  onOpenChange,
  onCreated,
  savedColors,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number) => void;
  /** cores personalizadas já usadas em outras matérias */
  savedColors: string[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** uma das cores prontas ("hema"…) ou personalizada ("#rrggbb") */
  const [color, setColor] = useState<string>("hema");
  const [customColor, setCustomColor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const swatches = [...STAINS, ...new Set([...savedColors, ...(customColor ? [customColor] : [])])];
  const create = trpc.subjects.create.useMutation({
    onSuccess: (s) => {
      onOpenChange(false);
      setName("");
      setDescription("");
      setColor("hema");
      setCustomColor(null);
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
            <span className="text-sm font-semibold" id="sub-color">Cor da matéria</span>
            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sub-color">
                {swatches.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={colorLabel(c)}
                    aria-label={colorLabel(c)}
                    onClick={() => setColor(c)}
                    className="h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      backgroundColor: swatchColor(c),
                      borderColor:
                        color === c ? "hsl(var(--foreground))" : "transparent",
                    }}
                    aria-pressed={color === c}
                  />
                ))}
              </div>
              {/* botão no canto: abre o seletor para criar uma cor nova */}
              <Popover
                open={pickerOpen}
                onOpenChange={(o) => {
                  if (o) setPickerKey((k) => k + 1); // reabre a partir da cor selecionada
                  setPickerOpen(o);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Escolher outra cor"
                    aria-label="Escolher outra cor"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/60 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[19rem]">
                  <p className="mb-3 font-display font-bold">Seletor de cores</p>
                  <ColorPicker
                    key={pickerKey}
                    value={swatchColor(color).toLowerCase()}
                    onChange={(hex) => {
                      setCustomColor(hex);
                      setColor(hex);
                    }}
                  />
                  <div className="mt-4 flex justify-end">
                    <Button size="sm" onClick={() => setPickerOpen(false)}>
                      Usar esta cor
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
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
                    <button
                      type="button"
                      aria-label={`Excluir ${s.name}`}
                      title="Excluir matéria"
                      className="relative z-[2] shrink-0 rounded p-1 -m-1 text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      onClick={() => setToDelete(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

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
