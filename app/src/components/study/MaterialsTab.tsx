import { useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  StickyNote,
  Upload,
  Trash2,
  RefreshCw,
  Eye,
  Loader2,
  CircleAlert,
  CircleCheck,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { formatBytes } from "@/lib/study";

const KIND_ICON = { pdf: FileText, image: ImageIcon, note: StickyNote } as const;
const KIND_LABEL = { pdf: "PDF", image: "Imagem", note: "Anotação" } as const;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function MaterialsTab({ subjectId }: { subjectId: number }) {
  const utils = trpc.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [toDelete, setToDelete] = useState<number | null>(null);

  const { data: materials, isLoading } = trpc.materials.list.useQuery({ subjectId });
  const invalidate = () => {
    utils.materials.list.invalidate({ subjectId });
    utils.subjects.list.invalidate();
  };

  const upload = trpc.materials.uploadFile.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const createNote = trpc.materials.createNote.useMutation({
    onSuccess: () => {
      toast.success("Anotação salva");
      setNoteTitle("");
      setNoteContent("");
      setShowNoteForm(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const reprocess = trpc.materials.reprocess.useMutation({
    onSuccess: (m) => {
      if (m?.status === "ready") toast.success("Texto extraído com sucesso");
      else if (m?.status === "error") toast.error(m.statusMsg ?? "Falha ao processar");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.materials.remove.useMutation({
    onSuccess: () => {
      toast.success("Material excluído");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  async function openOriginal(id: number) {
    try {
      const { url } = await utils.materials.fileUrl.fetch({ id });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir o arquivo");
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const f of list) {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isImage = f.type.startsWith("image/");
      if (!isPdf && !isImage) {
        toast.error(`"${f.name}" não é PDF nem imagem — ignorado.`);
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`"${f.name}" passa de 15 MB — ignorado.`);
        continue;
      }
      setUploading((u) => [...u, f.name]);
      try {
        const contentBase64 = await toBase64(f);
        const saved = await upload.mutateAsync({
          subjectId,
          name: f.name,
          contentBase64,
          contentType: f.type || (isPdf ? "application/pdf" : "image/jpeg"),
        });
        if (saved?.status === "ready") toast.success(`"${f.name}" processado`);
        else if (saved?.status === "error")
          toast.error(`"${f.name}": ${saved.statusMsg ?? "falha na extração"}`);
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
        invalidate();
      }
    }
  }

  return (
    <div className="space-y-6">
      <div
        className={`dropzone p-8 text-center ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 font-semibold">Arraste PDFs ou imagens aqui</p>
        <p className="text-sm text-muted-foreground">
          Slides, páginas do livro, fotos da lousa ou do caderno — até 15 MB cada
        </p>
        <div className="mt-4 flex justify-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            Escolher arquivos
          </Button>
          <Button variant="ghost" onClick={() => setShowNoteForm((v) => !v)}>
            <StickyNote className="mr-2 h-4 w-4" />
            Escrever anotação
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploading.map((n) => (
        <div key={n} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Enviando e extraindo texto de "{n}"…
        </div>
      ))}

      {showNoteForm && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <Input
            placeholder="Título da anotação (ex.: Resumo da aula 3)"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            maxLength={255}
          />
          <Textarea
            placeholder="Digite ou cole aqui suas anotações…"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={8}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNoteForm(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                createNote.mutate({
                  subjectId,
                  title: noteTitle.trim(),
                  content: noteContent.trim(),
                })
              }
              disabled={!noteTitle.trim() || noteContent.trim().length < 10 || createNote.isPending}
            >
              {createNote.isPending ? "Salvando…" : "Salvar anotação"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : materials?.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {materials.map((m) => {
            const Icon = KIND_ICON[m.kind];
            return (
              <li key={m.id} className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-4 w-4 text-secondary-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[m.kind]}
                    {m.fileSize ? ` · ${formatBytes(m.fileSize)}` : ""}
                    {" · "}
                    {m.status === "ready" && (
                      <span className="inline-flex items-center gap-1 text-[#2F7A55] dark:text-[#6CC79A]">
                        <CircleCheck className="h-3 w-3" /> texto extraído
                      </span>
                    )}
                    {m.status === "processing" && (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> processando…
                      </span>
                    )}
                    {m.status === "error" && (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <CircleAlert className="h-3 w-3" /> {m.statusMsg ?? "falha"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {m.fileKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Ver arquivo original"
                      onClick={() => openOriginal(m.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {m.status === "error" && m.kind !== "note" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Tentar extrair de novo"
                      onClick={() => reprocess.mutate({ id: m.id })}
                      disabled={reprocess.isPending}
                    >
                      <RefreshCw className={`h-4 w-4 ${reprocess.isPending ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Excluir"
                    onClick={() => setToDelete(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum material ainda. Envie um PDF, uma imagem ou escreva uma anotação
          para a IA poder gerar o conteúdo de estudo.
        </p>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir material?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo e o texto extraído serão apagados. Quizzes já gerados não
              são afetados.
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
