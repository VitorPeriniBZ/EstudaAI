import { useState } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  FlaskConical,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type ProviderForm = {
  name: string;
  type: "anthropic" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
  vision: boolean;
  priority: number;
  enabled: boolean;
};

const EMPTY_FORM: ProviderForm = {
  name: "",
  type: "anthropic",
  apiKey: "",
  baseUrl: "",
  model: "claude-sonnet-5",
  vision: true,
  priority: 10,
  enabled: true,
};

const TYPE_LABEL: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI-compatível",
};

const MODEL_PLACEHOLDER: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o-mini, llama-3.3-70b, gemini-2.0-flash…",
};

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);
  const [toDelete, setToDelete] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);

  const isAdmin = user?.role === "admin";
  const { data: providers, isLoading } = trpc.admin.listProviders.useQuery(undefined, {
    enabled: isAdmin,
  });

  const invalidate = () => utils.admin.listProviders.invalidate();

  const create = trpc.admin.createProvider.useMutation({
    onSuccess: () => {
      toast.success("Provedor adicionado");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.admin.updateProvider.useMutation({
    onSuccess: () => {
      toast.success("Provedor atualizado");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.admin.deleteProvider.useMutation({
    onSuccess: () => {
      toast.success("Provedor removido");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const test = trpc.admin.testProvider.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success(`Provedor respondeu — ${r.message}`);
      else toast.error(`Falha no teste: ${r.message}`);
      setTesting(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      setTesting(null);
    },
  });

  if (authLoading) return null;
  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Esta área é restrita ao administrador do site.
          </p>
        </main>
      </div>
    );
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowKey(false);
    setDialogOpen(true);
  }

  function openEdit(p: NonNullable<typeof providers>[number]) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      apiKey: "", // vazio = manter a chave atual
      baseUrl: p.baseUrl ?? "",
      model: p.model,
      vision: p.vision,
      priority: p.priority,
      enabled: p.enabled,
    });
    setShowKey(false);
    setDialogOpen(true);
  }

  function save() {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      apiKey: form.apiKey.trim(),
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      vision: form.vision,
      priority: form.priority,
      enabled: form.enabled,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate(payload);
  }

  const saving = create.isPending || update.isPending;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-extrabold text-3xl tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-primary" /> Provedores de IA
            </h1>
            <p className="text-muted-foreground mt-1 max-w-xl">
              Cadastre uma ou mais IAs. O EstudaAí usa a de menor prioridade
              primeiro; se os créditos acabarem ou o serviço cair, ele passa
              automaticamente para a próxima da lista.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar IA
          </Button>
        </div>

        <div className="mt-4 rounded-lg border bg-accent/50 p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Como funciona o failover:</strong>{" "}
          prioridade menor = tentada primeiro. Erros de quota esgotada, limite de
          requisições ou instabilidade passam para o próximo provedor. Erros de
          conteúdo não fazem fallback (a resposta seria a mesma em qualquer IA).
          Sem nenhum provedor ativo, resumo, quiz, flashcards, chat e leitura de
          imagens ficam indisponíveis.
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : providers?.length ? (
          <ul className="mt-6 space-y-3">
            {providers.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border bg-card p-4 flex items-center gap-3"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{p.name}</p>
                    <span className="text-xs rounded-full bg-secondary px-2 py-0.5">
                      {TYPE_LABEL[p.type]}
                    </span>
                    <span className="text-xs rounded-full bg-secondary px-2 py-0.5">
                      prioridade {p.priority}
                    </span>
                    {p.vision && (
                      <span className="text-xs rounded-full bg-accent text-accent-foreground px-2 py-0.5">
                        lê imagens
                      </span>
                    )}
                    {!p.enabled && (
                      <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
                        desativado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    modelo: {p.model}
                    {p.apiKey ? ` · chave ${p.apiKey}` : " · sem chave"}
                    {p.baseUrl ? ` · ${p.baseUrl}` : ""}
                    {p.lastTestAt && (
                      <>
                        {" · último teste "}
                        <span className={p.lastTestOk ? "text-[#2F7A55] dark:text-[#6CC79A]" : "text-destructive"}>
                          {p.lastTestOk ? "OK" : "falhou"}
                        </span>
                        {p.lastTestMsg ? ` (${p.lastTestMsg})` : ""}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(enabled) =>
                      update.mutate({ id: p.id, enabled })
                    }
                    aria-label={`Ativar/desativar ${p.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Testar provedor"
                    disabled={testing === p.id}
                    onClick={() => {
                      setTesting(p.id);
                      test.mutate({ id: p.id });
                    }}
                  >
                    <FlaskConical
                      className={`h-4 w-4 ${testing === p.id ? "animate-pulse" : ""}`}
                    />
                  </Button>
                  <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(p)}>
                    <Plus className="hidden" />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setToDelete(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-lg border bg-card p-10 text-center text-muted-foreground">
            <p className="text-sm">
              Nenhum provedor cadastrado — as funções de IA estão desligadas.
              Adicione a Anthropic (Claude) ou outro provedor OpenAI-compatível
              para liberar resumo, quiz, flashcards e chat. Dica: definir
              ANTHROPIC_API_KEY no servidor cadastra a Anthropic sozinho.
            </p>
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingId ? "Editar provedor" : "Adicionar provedor de IA"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold">Nome</label>
              <Input
                placeholder="Ex.: Anthropic — Claude Sonnet 5"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">Tipo</label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  const type = v as ProviderForm["type"];
                  setForm({
                    ...form,
                    type,
                    model: type === "anthropic" ? "claude-sonnet-5" : form.model,
                    vision: type === "anthropic",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="openai">
                    OpenAI-compatível (OpenAI, Groq, OpenRouter, Gemini…)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(
              <div>
                <label className="text-sm font-semibold">
                  API key {editingId && "(deixe vazio para manter a atual)"}
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={form.type === "anthropic" ? "sk-ant-…" : "sk-…"}
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            {form.type === "openai" && (
              <div>
                <label className="text-sm font-semibold">
                  Base URL (opcional — padrão: api.openai.com)
                </label>
                <Input
                  placeholder="https://api.groq.com/openai/v1"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-semibold">Modelo</label>
              <Input
                placeholder={MODEL_PLACEHOLDER[form.type]}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold">Prioridade (menor = primeiro)</label>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex flex-col gap-3 pt-6">
                <label className="flex items-center justify-between text-sm">
                  Lê imagens (visão)
                  <Switch
                    checked={form.vision}
                    onCheckedChange={(vision) => setForm({ ...form, vision })}
                  />
                </label>
                <label className="flex items-center justify-between text-sm">
                  Ativo
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                  />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!form.name.trim() || !form.model.trim() || saving}>
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover provedor?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave será apagada. Se era o único provedor ativo, as funções de
              IA ficam indisponíveis até você cadastrar outro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && del.mutate({ id: toDelete })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
