/**
 * Pipeline de IA do EstudaAí — extração de texto, quiz, resumo, flashcards e chat.
 * Todas as chamadas passam pela cadeia de provedores com fallback (api/ai/providers.ts).
 */
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { withAiFallback } from "./providers";

/**
 * Tentativas extras por provedor. O failover já troca de IA quando uma falha;
 * repetir muito só gasta a cota (planos grátis têm poucas requisições/minuto).
 */
const AI_RETRIES = 1;

/* ---------------- Extração de texto ---------------- */

/** Extrai texto de um PDF (buffer). */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(bytes, { mergePages: true });
  return (result.text ?? "").trim();
}

/** Transcreve o conteúdo de uma imagem (foto de lousa, página escaneada, anotação) via modelo com visão. */
export async function extractImageText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const base64 = Buffer.from(bytes).toString("base64");
  const mime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
  return withAiFallback(
    async (model) => {
      const { text } = await generateText({
        maxRetries: AI_RETRIES,
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Esta imagem é material de estudo de um universitário (slide, página de livro, anotação, quadro). " +
                  "Transcreva TODO o conteúdo visível em texto corrido, em português, preservando termos técnicos, listas e datas. " +
                  "Se houver tabelas ou diagramas, descreva-os em texto. Responda apenas com o conteúdo extraído.",
              },
              { type: "image", image: `data:${mime};base64,${base64}` },
            ],
          },
        ],
      });
      return text.trim();
    },
    { needVision: true },
  );
}

/* ---------------- Geração de conteúdo de estudo ---------------- */

const MAX_CONTEXT = 60_000;

/** Corta o material para a fração pedida (quando o provedor tem limite de tamanho). */
function fit(context: string, factor: number): string {
  if (factor >= 1) return context;
  const max = Math.max(2_000, Math.floor(context.length * factor));
  return context.length > max
    ? context.slice(0, max) + "\n\n[...material reduzido para caber no limite da IA...]"
    : context;
}

export function buildContext(materialsText: string[]): string {
  const joined = materialsText
    .map((t, i) => `--- Material ${i + 1} ---\n${t}`)
    .join("\n\n");
  return joined.length > MAX_CONTEXT
    ? joined.slice(0, MAX_CONTEXT) + "\n\n[...conteúdo truncado...]"
    : joined;
}

const quizSchema = z.object({
  title: z.string().describe("Título curto do quiz"),
  questions: z.array(
    z.object({
      topic: z
        .string()
        .describe("Tema/tópico da questão (ex.: nome do capítulo)"),
      question: z.string(),
      options: z.array(z.string()).length(4),
      answerIndex: z.number().int().min(0).max(3),
      explanation: z
        .string()
        .describe("Explicação didática de 1-3 frases sobre a resposta certa"),
    }),
  ),
});

export type GeneratedQuiz = z.infer<typeof quizSchema>;

export async function generateQuizFromContext(
  context: string,
  subjectName: string,
  count: number,
): Promise<GeneratedQuiz> {
  return withAiFallback(async (model, { contextFactor }) => {
    const { object } = await generateObject({
      maxRetries: AI_RETRIES,
      model,
      schema: quizSchema,
      prompt:
        `Você é um professor universitário criando um quiz de múltipla escolha sobre a matéria "${subjectName}".\n` +
        `Com base EXCLUSIVA no material abaixo, crie exatamente ${count} questões em português.\n` +
        `Regras:\n` +
        `- Cada questão tem 4 alternativas e apenas UMA correta (answerIndex 0-3).\n` +
        `- Varie os temas (campo "topic") cobrindo os principais assuntos do material.\n` +
        `- Distratores plausíveis, sem pegadinhas de redação.\n` +
        `- A explicação deve citar o conceito do material que justifica a resposta.\n` +
        `- Não invente fatos fora do material.\n\n` +
        `MATERIAL:\n${fit(context, contextFactor)}`,
    });
    return object;
  });
}

export async function generateSummaryFromContext(
  context: string,
  subjectName: string,
): Promise<string> {
  return withAiFallback(async (model, { contextFactor }) => {
    const { text } = await generateText({
        maxRetries: AI_RETRIES,
      model,
      prompt:
        `Você é um professor universitário. Escreva um RESUMO DE ESTUDO completo e bem organizado da matéria "${subjectName}", ` +
        `em português, usando apenas o material abaixo.\n` +
        `Formato em Markdown:\n` +
        `- Títulos ## por tema, na ordem lógica do conteúdo.\n` +
        `- Definições em negrito, listas curtas, tabelas comparativas quando fizer sentido.\n` +
        `- Um bloco "> Não confunda:" sempre que houver conceitos que os alunos costumam trocar.\n` +
        `- Linguagem direta, sem enrolação, focada no que cai em prova.\n\n` +
        `MATERIAL:\n${fit(context, contextFactor)}`,
    });
    return text.trim();
  });
}

const flashcardsSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string().describe("Pergunta ou termo (frente do cartão)"),
      back: z
        .string()
        .describe("Resposta ou definição (verso do cartão)"),
    }),
  ),
});

export async function generateFlashcardsFromContext(
  context: string,
  subjectName: string,
  count: number,
): Promise<{ front: string; back: string }[]> {
  return withAiFallback(async (model, { contextFactor }) => {
    const { object } = await generateObject({
      maxRetries: AI_RETRIES,
      model,
      schema: flashcardsSchema,
      prompt:
        `Você é um professor universitário criando flashcards de revisão sobre "${subjectName}".\n` +
        `Com base EXCLUSIVA no material abaixo, crie exatamente ${count} flashcards em português.\n` +
        `- Frente: pergunta curta ou termo. Verso: resposta objetiva (1-3 frases).\n` +
        `- Cubra definições, classificações, ciclos, comparações e pegadinhas clássicas.\n\n` +
        `MATERIAL:\n${fit(context, contextFactor)}`,
    });
    return object.cards;
  });
}

export async function chatReply(
  context: string,
  subjectName: string,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): Promise<string> {
  return withAiFallback(async (model, { contextFactor }) => {
    const { text } = await generateText({
        maxRetries: AI_RETRIES,
      model,
      system:
        `Você é um tutor da matéria "${subjectName}" ajudando um universitário a estudar. ` +
        `Responda em português, de forma didática e objetiva, usando Markdown leve. ` +
        `Baseie-se no material do estudante abaixo; se a resposta não estiver no material, diga isso e responda com conhecimento geral deixando claro que é complementar.\n\n` +
        `MATERIAL DO ESTUDANTE:\n${fit(context, contextFactor)}`,
      messages: [
        ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: question },
      ],
    });
    return text.trim();
  });
}
