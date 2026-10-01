import { useEffect, useRef, useState } from "react";
import { usePlan } from "@/hooks/usePlan";
import { MessageCircleQuestion, Send, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import Markdown from "@/components/Markdown";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Quais são os pontos mais importantes para a prova?",
  "Explique o tema principal como se eu tivesse 15 anos",
  "Monte 3 pegadinhas que podem cair na prova",
  "O que eu costumo confundir nesse conteúdo?",
];

export default function ChatTab({ subjectId }: { subjectId: number }) {
  const utils = trpc.useUtils();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history, isLoading } = trpc.study.chatHistory.useQuery({ subjectId });
  const plan = usePlan();
  const chatLeft =
    plan.data && plan.data.limits.maxChatPerDay !== null
      ? Math.max(0, plan.data.limits.maxChatPerDay - plan.data.usage.chatToday)
      : null;
  // pergunta já enviada, exibida na hora enquanto a resposta não chega
  const [pending, setPending] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const send = trpc.study.chatSend.useMutation();

  useEffect(() => {
    if (!pending) return;
    setElapsed(0);
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [pending]);

  const status =
    elapsed < 6
      ? "Pensando"
      : elapsed < 15
        ? "Lendo seus materiais"
        : elapsed < 35
          ? "Escrevendo a resposta"
          : "Quase lá — respostas longas podem levar até 1 minuto";
  const clear = trpc.study.chatClear.useMutation({
    onSuccess: () => {
      toast.success("Conversa limpa");
      utils.study.chatHistory.invalidate({ subjectId });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history?.length, pending]);

  async function ask(msg?: string) {
    const text = (msg ?? input).trim();
    if (!text || pending) return;
    setInput("");
    setPending(text);
    try {
      await send.mutateAsync({ subjectId, message: text });
      await utils.study.chatHistory.invalidate({ subjectId });
    } catch (e) {
      setInput(text); // devolve o texto para a pessoa não perder a pergunta
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "28rem" }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">
          Pergunte qualquer coisa sobre o material desta matéria.
        </p>
        {!!history?.length && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clear.mutate({ subjectId })}
            disabled={clear.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      <div className="flex-1 rounded-lg border bg-card p-4 space-y-4 max-h-[28rem] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-2/3 ml-auto" />
          </div>
        ) : history?.length || pending ? (
          <>
            {(history ?? []).map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary text-secondary-foreground rounded-bl-md"
                  }`}
                >
                  {m.role === "user" ? (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <Markdown>{m.content}</Markdown>
                  )}
                </div>
              </div>
            ))}
            {pending && (
              <>
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    <p className="whitespace-pre-wrap">{pending}</p>
                  </div>
                </div>
                <div className="flex justify-start" role="status" aria-live="polite">
                  <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md bg-secondary px-4 py-3 text-sm text-muted-foreground">
                    <span className="typing" aria-hidden><i /><i /><i /></span>
                    <span>{status}…</span>
                    {elapsed >= 6 && <span className="tabular-nums text-xs opacity-70">{elapsed}s</span>}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="text-center py-6">
            <MessageCircleQuestion className="mx-auto h-8 w-8 mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-4">
              Nenhuma pergunta ainda. Tente uma destas:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {chatLeft !== null && (
        <p className={`mt-3 text-xs ${chatLeft === 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {chatLeft === 0
            ? "Você usou as perguntas de hoje do plano Gratuito. Volte amanhã ou assine o PRO para perguntas sem limite."
            : `Plano Gratuito: ${chatLeft} de ${plan.data?.limits.maxChatPerDay} perguntas restantes hoje · ilimitado no PRO`}
        </p>
      )}
      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          disabled={chatLeft === 0}
          placeholder={chatLeft === 0 ? "Limite de perguntas de hoje atingido" : "Digite sua dúvida… (Enter envia, Shift+Enter quebra linha)"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <Button
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => ask()}
          disabled={!input.trim() || !!pending || chatLeft === 0}
          aria-label="Enviar pergunta"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
