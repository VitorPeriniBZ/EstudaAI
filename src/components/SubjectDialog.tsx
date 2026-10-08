import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { STAINS, STAIN_LABELS, isStain, swatchColor } from "@/lib/study";

const colorLabel = (c: string) => (isStain(c) ? STAIN_LABELS[c] : `Cor personalizada ${c}`);

type EditableSubject = { id: number; name: string; description: string | null; color: string };

/**
 * Diálogo de matéria: cria uma nova ou, com `subject`, edita nome, descrição e cor.
 * Os campos começam com os valores de `subject` na montagem — para reabrir com os
 * dados atuais, troque a `key` ao abrir.
 */
export default function SubjectDialog({
  open,
  onOpenChange,
  onSaved,
  savedColors,
  subject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** chamado com o id da matéria criada ou editada */
  onSaved: (id: number) => void;
  /** cores personalizadas já usadas em outras matérias */
  savedColors: string[];
  /** matéria a editar; sem ela, o diálogo cria uma nova */
  subject?: EditableSubject;
}) {
  const editing = !!subject;
  const [name, setName] = useState(subject?.name ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  /** uma das cores prontas ("hema"…) ou personalizada ("#rrggbb") */
  const [color, setColor] = useState<string>(subject?.color ?? "hema");
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
      if (s?.id) onSaved(s.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.subjects.update.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      toast.success("Matéria atualizada");
      if (subject) onSaved(subject.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const saving = create.isPending || update.isPending;

  function save() {
    if (subject) {
      update.mutate({ id: subject.id, name: name.trim(), description: description.trim() || null, color });
    } else {
      create.mutate({ name: name.trim(), description: description.trim() || undefined, color });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{editing ? "Editar matéria" : "Nova matéria"}</DialogTitle>
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
          <Button onClick={save} disabled={!name.trim() || saving}>
            {editing
              ? update.isPending ? "Salvando…" : "Salvar alterações"
              : create.isPending ? "Criando…" : "Criar matéria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
