// Testes de unidade (rodam com tsx): esquema estrito, quiz e Markdown
import { zodSchema } from "ai";
import { quizSchema, flashcardsSchema, normalizeQuiz, topicTarget, extractJson } from "../../api/ai/generate";
import { classifyAiError, AiBadOutput, AiRejected, AiTooLarge, AiTransient, AiUnavailable } from "../../api/ai/errors";
import { normalizeMarkdown } from "../../src/lib/markdown";
import { healthRoutes } from "../../api/lib/health";
import { safeNext } from "../../api/auth/google";
let pass = 0, fail = 0;
const ok = (c: boolean, n: string, x = "") => { if (c) { pass++; console.log("  ✔", n); } else { fail++; console.log("  ✘", n, x); } };

const BANNED = ["minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern"];
function strictErrors(node: any, path = "$"): string[] {
  const e: string[] = [];
  if (!node || typeof node !== "object") return e;
  for (const k of BANNED) if (k in node) e.push(`${path}: ${k}`);
  if (node.type === "object") {
    const props = Object.keys(node.properties ?? {}), req = node.required ?? [];
    const miss = props.filter((p) => !req.includes(p));
    if (miss.length) e.push(`${path}: fora de required: ${miss}`);
    if (node.additionalProperties !== false) e.push(`${path}: additionalProperties`);
    for (const p of props) e.push(...strictErrors(node.properties[p], `${path}.${p}`));
  }
  if (node.items) e.push(...strictErrors(node.items, `${path}[]`));
  return e;
}
console.log("\nEsquemas enviados às IAs (modo estrito)");
for (const [n, sch] of [["quiz", quizSchema], ["flashcards", flashcardsSchema]] as const) {
  const e = strictErrors(zodSchema(sch).jsonSchema);
  ok(!e.length, `esquema de ${n} compatível com Groq/OpenAI strict`, e.join("; "));
}

console.log("\nNormalização do quiz");
const q = normalizeQuiz({ title: " Q ", topics: ["Ascaris lumbricoides", "Enterobius vermicularis"], questions: [
  { topic: "Habitat do Ascaris lumbricoides", question: "1. Onde vive?", options: ["A) Jejuno", "B) Ceco", "C) Fígado", "D) Pulmão"], answerIndex: 0, explanation: "x" },
  { topic: "Enterobius", question: "Questão 2: Sintoma?", options: ["(a) p", "(b) q", "(c) r", "(d) s"], answerIndex: 1.0, explanation: "x" },
  { topic: "Oxiúros", question: "Sem tema", options: ["m", "n", "o", "t"], answerIndex: 2, explanation: "x" },
  { topic: "Ascaris", question: "Repetidas", options: ["X", "X", "Y", "Z"], answerIndex: 0, explanation: "x" },
  { topic: "Ascaris", question: "Índice inválido", options: ["a", "b", "c", "d"], answerIndex: 7, explanation: "x" },
  { topic: "Ascaris", question: "Só 3", options: ["a", "b", "c"], answerIndex: 0, explanation: "x" },
] }, 10);
ok(q.questions.length === 3, "descarta repetidas, índice inválido e menos de 4 alternativas", String(q.questions.length));
ok(q.questions[0].question === "Onde vive?" && q.questions[1].question === "Sintoma?", "remove numeração do enunciado");
ok(q.questions[0].options[0] === "Jejuno" && q.questions[1].options[0] === "p", "remove letras das alternativas");
ok(q.questions[0].topic === "Ascaris lumbricoides" && q.questions[1].topic === "Enterobius vermicularis", "prende ao tema declarado");
ok(q.questions[2].topic === "Outros temas", "sem correspondência vai para Outros temas");
ok(topicTarget(10) === 3 && topicTarget(25) === 6 && topicTarget(50) === 8, "quantidade de temas por tamanho do quiz");

console.log("\nClassificação de erros das IAs");
const mk = (statusCode: number, message: string) => ({ name: "AI_APICallError", statusCode, message, responseBody: JSON.stringify({ error: { message } }) });
ok(classifyAiError(mk(400, "Failed to generate JSON. Please adjust your prompt.")) instanceof AiBadOutput, "Groq json_validate_failed → tentar de novo");
ok(classifyAiError({ name: "AI_NoObjectGeneratedError", message: "x" }) instanceof AiBadOutput, "objeto fora do esquema → tentar de novo");
ok(classifyAiError(mk(400, "rejected by content policy")) instanceof AiRejected, "400 genérico → recusa deste provedor (cadeia continua)");
ok(classifyAiError(mk(413, "Request too large ... Limit 8000, Requested 17797")) instanceof AiTooLarge, "413 → reduzir material");

// mensagens REAIS dos provedores (não simplificar: foi um mock "rate limited" que escondeu o bug do TPM)
const GROQ_429 = "Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01jxyz` service tier `on_demand` on tokens per minute (TPM): Limit 6000, Used 5000, Requested 2000. Please try again in 10s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing";
const OPENAI_429 = "Rate limit reached for gpt-4o-mini in organization org-abc123 on tokens per min (TPM): Limit 200000, Used 199000, Requested 2000. Please try again in 300ms. Visit https://platform.openai.com/account/rate-limits to learn more.";
const OPENAI_429_GRANDE = "Request too large for gpt-4o in organization org-abc123 on tokens per min (TPM): Limit 30000, Requested 50000. The input or output tokens must be reduced in order to run successfully. Visit https://platform.openai.com/account/rate-limits to learn more.";
const GEMINI_429_SEM_COTA = "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.5-pro";
const groq = classifyAiError(mk(429, GROQ_429));
ok(!(groq instanceof AiTooLarge) && groq instanceof AiTransient, "429 de TPM da Groq (mensagem real) NÃO é pedido grande → próxima IA", groq.name);
const groqRetry = classifyAiError({ name: "AI_RetryError", message: "Failed after 2 attempts", lastError: mk(429, GROQ_429) });
ok(!(groqRetry instanceof AiTooLarge) && groqRetry instanceof AiTransient, "429 da Groq depois das retentativas do AI SDK também", groqRetry.name);
const openai = classifyAiError(mk(429, OPENAI_429));
ok(!(openai instanceof AiTooLarge) && openai instanceof AiTransient, "429 de TPM da OpenAI (mensagem real) NÃO é pedido grande", openai.name);
ok(classifyAiError(mk(429, OPENAI_429_GRANDE)) instanceof AiTooLarge, "429 'Request too large' (pedido sozinho passa do TPM) → reduzir material");
ok(classifyAiError(mk(429, GEMINI_429_SEM_COTA)) instanceof AiUnavailable, "429 do Gemini sem cota gratuita (limit: 0) → provedor indisponível");

console.log("\nPlano B: JSON em texto");
ok((extractJson("Claro!\n```json\n{\"a\":1}\n```") as any).a === 1, "extrai JSON entre crases");
ok((extractJson("Aqui: {\"a\":{\"b\":2}} pronto") as any).a.b === 2, "extrai JSON no meio do texto");
let threw = false; try { extractJson("sem json aqui"); } catch { threw = true; }
ok(threw, "texto sem JSON é recusado");

console.log("\nMarkdown");
ok(normalizeMarkdown("| a | b<br>c |") === "| a | b · c |", "<br> dentro de tabela vira separador");
ok(normalizeMarkdown("linha 1<br/>linha 2") === "linha 1  \nlinha 2", "<br> fora de tabela vira quebra de linha");

console.log("\nHealth check");
{
  let consultas = 0;
  const vivo = healthRoutes(async () => { consultas++; });
  for (let i = 0; i < 5; i++) await vivo.request("/");
  ok(consultas === 0, "/api/health não consulta o banco (o Neon pode pausar)", `${consultas} consultas`);
  const r = await vivo.request("/db");
  ok(r.status === 200 && consultas === 1, "/api/health/db consulta o banco");
  const semBanco = healthRoutes(async () => { throw new Error("banco fora do ar"); });
  ok((await semBanco.request("/")).status === 200, "/api/health responde mesmo com o banco fora do ar");
  const rdb = await semBanco.request("/db");
  ok(rdb.status === 503 && (await rdb.json()).ok === false, "/api/health/db responde 503 com o banco fora do ar");
}

console.log("\nRedirecionamento após o login (?next=)");
for (const v of ["/\\exemplo.invalid", "//evil.com", "/\u0000x", "/\t/evil.com", "https://evil.com", "", undefined]) {
  ok(safeNext(v) === "/app", `recusa ${JSON.stringify(v)}`, safeNext(v));
}
ok(safeNext("/app/materia/12?aba=quiz") === "/app/materia/12?aba=quiz", "aceita caminho interno");
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
