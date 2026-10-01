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
  topics: z
    .array(z.string())
    .optional()
    .describe("Lista dos temas amplos do quiz (cada questão usa exatamente um deles)"),
  questions: z.array(
    z.object({
      topic: z.string().describe("Um dos temas da lista `topics`, escrito igual"),
      question: z.string(),
      options: z.array(z.string()).length(4),
      answerIndex: z.number().int().min(0).max(3),
      explanation: z
        .string()
        .describe("Explicação didática de 1-3 frases sobre a resposta certa"),
    }),
  ),
});

export type GeneratedQuiz = { title: string; questions: z.infer<typeof quizSchema>["questions"] };

/** Quantos temas pedir: poucos e amplos, com várias questões cada. */
export function topicTarget(count: number): number {
  return Math.max(2, Math.min(8, Math.round(count / 4)));
}

/**
 * PROMPT PADRÃO DO QUIZ — mude aqui para alterar o estilo de todos os quizzes.
 * Mantém sempre o mesmo formato: temas amplos, 4 alternativas, uma correta,
 * explicação curta citando o material.
 */
export function quizPrompt(subjectName: string, count: number, material: string): string {
  const nTopics = topicTarget(count);
  return [
    `Você é um professor universitário elaborando um quiz de múltipla escolha da matéria "${subjectName}".`,
    `Use EXCLUSIVAMENTE o material abaixo. Crie exatamente ${count} questões em português do Brasil.`,
    ``,
    `TEMAS`,
    `- Antes das questões, defina ${nTopics} temas AMPLOS no campo "topics" (ex.: o nome de um capítulo, de um parasita, de um sistema ou de um grande conceito).`,
    `- Tema NUNCA é a pergunta nem um detalhe dela: "Ascaris lumbricoides" é tema; "Habitat do Ascaris" não é.`,
    `- Cada questão usa no campo "topic" exatamente um nome da lista "topics", escrito igual.`,
    `- Distribua as questões de forma equilibrada: cada tema com pelo menos ${Math.max(2, Math.floor(count / nTopics) - 1)} questões.`,
    ``,
    `FORMATO DE CADA QUESTÃO`,
    `- "question": enunciado claro e completo, em uma ou duas frases, sem numeração ("1.", "Questão 1") e sem as alternativas no texto.`,
    `- "options": exatamente 4 alternativas, sem letras ou números na frente ("A)", "a.", "1-"), com tamanho e estilo parecidos.`,
    `- Apenas UMA alternativa correta; "answerIndex" (0 a 3) indica qual. Varie a posição da correta entre as questões.`,
    `- Distratores plausíveis e do mesmo assunto. Proibido: "todas as anteriores", "nenhuma das anteriores", pegadinhas de redação, duplas negações.`,
    `- "explanation": 1 a 3 frases dizendo por que a correta está certa, citando o conceito do material.`,
    `- Misture níveis: definições, mecanismos/ciclos, comparações e aplicação prática. Não repita a mesma pergunta com outras palavras.`,
    `- Não invente fatos que não estejam no material.`,
    ``,
    `MATERIAL:`,
    material,
  ].join("\n");
}

const LETTER_PREFIX = /^\s*(\(?[a-dA-D1-4]\)|[a-dA-D1-4][.)\-:–]|alternativa\s+[a-d][:.)-]?)\s+/;
const NUMBER_PREFIX = /^\s*(quest[aã]o\s*\d+\s*[:.)-]?|\d+\s*[.)-])\s*/i;

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Normaliza o quiz que veio da IA para sempre ter o mesmo padrão:
 * - remove "A)", "1." etc. de alternativas e enunciados;
 * - descarta questões com alternativas repetidas;
 * - prende cada questão a um tema da lista e funde temas com 1 questão só.
 */
export function normalizeQuiz(raw: z.infer<typeof quizSchema>, count: number): GeneratedQuiz {
  const qs = raw.questions
    .map((q) => ({
      topic: (q.topic || "").trim(),
      question: q.question.replace(NUMBER_PREFIX, "").trim(),
      options: q.options.map((o) => o.replace(LETTER_PREFIX, "").trim()),
      answerIndex: q.answerIndex,
      explanation: q.explanation.trim(),
    }))
    .filter((q) => q.question && q.options.every(Boolean) && new Set(q.options.map(norm)).size === 4);

  const OTHER = "Outros temas";
  const declared = (raw.topics ?? []).map((t) => t.trim()).filter(Boolean);
  let topics: string[];
  if (declared.length) {
    topics = declared;
  } else {
    // IA não declarou temas: fica com os mais frequentes, no máximo o alvo
    const freq = new Map<string, number>();
    for (const q of qs) if (q.topic) freq.set(q.topic, (freq.get(q.topic) ?? 0) + 1);
    topics = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topicTarget(count)).map(([t]) => t);
  }
  topics = [...new Map(topics.map((t) => [norm(t), t])).values()];

  const match = (t: string): string => {
    const nt = norm(t);
    if (!nt) return OTHER;
    const exact = topics.find((x) => norm(x) === nt);
    if (exact) return exact;
    const partial = topics.find((x) => nt.includes(norm(x)) || norm(x).includes(nt));
    if (partial) return partial;
    // maior sobreposição de palavras significativas
    const words = new Set(nt.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    let best: string | null = null, score = 0;
    for (const x of topics) {
      const sc = norm(x).split(/[^a-z0-9]+/).filter((w) => words.has(w)).length;
      if (sc > score) { best = x; score = sc; }
    }
    return best ?? OTHER;
  };
  for (const q of qs) q.topic = match(q.topic);

  return {
    title: raw.title?.trim() || "Quiz",
    questions: qs.slice(0, count).map((q) => ({ ...q, topic: q.topic.slice(0, 160) })),
  };
}

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
      system:
        "Você gera quizzes educacionais em JSON seguindo rigorosamente o formato pedido. " +
        "Responda somente com o objeto JSON do esquema.",
      prompt: quizPrompt(subjectName, count, fit(context, contextFactor)),
    });
    const quiz = normalizeQuiz(object, count);
    if (quiz.questions.length < Math.min(count, 3)) {
      throw Object.assign(new Error("A IA devolveu questões fora do padrão"), { name: "AI_NoObjectGeneratedError" });
    }
    return quiz;
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
