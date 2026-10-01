import { zodSchema } from "ai";
import { quizSchema, flashcardsSchema } from "../api/ai/generate";
const BANNED = ["minItems","maxItems","minimum","maximum","exclusiveMinimum","exclusiveMaximum","minLength","maxLength","pattern"];
function check(name: string, node: any, path = "$"): string[] {
  const errs: string[] = [];
  if (!node || typeof node !== "object") return errs;
  for (const k of BANNED) if (k in node) errs.push(`${path}: palavra-chave "${k}" não suportada no modo estrito`);
  if (node.type === "object") {
    const props = Object.keys(node.properties ?? {});
    const req = node.required ?? [];
    const missing = props.filter((p) => !req.includes(p));
    if (missing.length) errs.push(`${path}: fora de "required": ${missing.join(", ")}`);
    if (node.additionalProperties !== false) errs.push(`${path}: additionalProperties precisa ser false`);
    for (const p of props) errs.push(...check(name, node.properties[p], `${path}.${p}`));
  }
  if (node.items) errs.push(...check(name, node.items, `${path}[]`));
  return errs;
}
let bad = 0;
for (const [name, sch] of [["quiz", quizSchema], ["flashcards", flashcardsSchema]] as const) {
  const js = zodSchema(sch).jsonSchema;
  const errs = check(name, js);
  console.log(errs.length ? `✘ ${name}\n   ${errs.join("\n   ")}` : `✔ ${name}: esquema compatível com o modo estrito`);
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
