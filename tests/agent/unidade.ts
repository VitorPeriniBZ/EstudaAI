// Testes de unidade (rodam com tsx): esquema estrito, quiz e Markdown
import { zodSchema } from "ai";
import { quizSchema, flashcardsSchema, normalizeQuiz, topicTarget } from "../../api/ai/generate";
import { normalizeMarkdown } from "../../src/lib/markdown";
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

console.log("\nMarkdown");
ok(normalizeMarkdown("| a | b<br>c |") === "| a | b · c |", "<br> dentro de tabela vira separador");
ok(normalizeMarkdown("linha 1<br/>linha 2") === "linha 1  \nlinha 2", "<br> fora de tabela vira quebra de linha");
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
