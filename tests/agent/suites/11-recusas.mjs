// Recusas e formato inválido: o caso do aluno que viu "Não foi possível gerar..."
const B = process.env.AGENT_BASE_URL; let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✔", n); } else { fail++; console.log("  ✘", n, x); } };
async function login(code) { const r1 = await fetch(B + "/api/auth/google", { redirect: "manual" });
  const c1 = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); const st = new URL(r1.headers.get("location")).searchParams.get("state");
  const r2 = await fetch(`${B}/api/auth/google/callback?code=${code}&state=${st}`, { redirect: "manual", headers: { cookie: c1 } });
  return r2.headers.getSetCookie().find((c) => c.startsWith("estudaai_sid=")).split(";")[0]; }
async function t(ck, p, input, q) { const url = `${B}/api/trpc/${p}` + (q ? `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}` : "");
  const r = await fetch(url, { method: q ? "GET" : "POST", headers: { "content-type": "application/json", cookie: ck }, body: q ? undefined : JSON.stringify({ json: input ?? null }) });
  const j = await r.json(); return { data: j.result?.data?.json, error: j.error?.json }; }
const stats = async () => (await fetch("http://localhost:4002/stats")).json();
const A = await login("code-ana"), U = await login("code-bia");
const mk = (name, route, priority) => t(A, "admin.createProvider", { name, type: "openai", apiKey: "sk-test-1234567", baseUrl: `http://localhost:4002/${route}/v1`, model: "m", priority });
const clear = async () => { for (const p of (await t(A, "admin.listProviders", null, true)).data) await t(A, "admin.deleteProvider", { id: p.id }); };
// aluna no PRO: aqui o assunto é recusa de IA, não o limite do plano Gratuito
const bia = (await t(A, "admin.listUsers", null, true)).data.find((u) => u.email === "bia@example.com");
await t(A, "admin.updateUser", { id: bia.id, plan: "pro" });
const s = (await t(U, "subjects.create", { name: "P" })).data.id;
await t(U, "materials.createNote", { subjectId: s, title: "n", content: "Ascaris vive no jejuno." });

console.log("\nCaso do aluno: Claude com chave inválida → Groq erra o formato estruturado");
await mk("Claude", "badkey", 1); await mk("Groq", "badjson", 2); await mk("Gemini", "ok", 3);
const okBefore = (await stats()).ok || 0;
const q1 = await t(U, "study.generateQuiz", { subjectId: s, count: 5 });
ok(q1.data?.count === 5, "quiz gerado (antes o aluno via \"Não foi possível gerar\")", JSON.stringify(q1.error?.message));
const st = await stats();
ok(st.badjson === 2 && (st.ok || 0) === okBefore, "o próprio Groq resolveu pelo plano B (JSON em texto), sem precisar do Gemini", JSON.stringify(st));
const fc = await t(U, "study.generateFlashcards", { subjectId: s, count: 5 });
ok(fc.data?.count === 5, "flashcards também usam o plano B");

console.log("\nModelo que não aceita formato estruturado");
await clear(); await mk("Sem json_schema", "nostructured", 1);
const q3 = await t(U, "study.generateQuiz", { subjectId: s, count: 5 });
ok(q3.data?.count === 5, "quiz gerado pelo plano B", JSON.stringify(q3.error?.message));

console.log("\nIA instável: erra o formato 1x e acerta na 2ª");
await clear(); await mk("Groq instável", "flaky", 1);
const q2 = await t(U, "study.generateFlashcards", { subjectId: s, count: 5 });
ok(q2.data?.count === 5, "nova tentativa no mesmo provedor resolveu", JSON.stringify(q2.error?.message));

console.log("\nRecusa genérica (400) num provedor e outro funcionando");
await clear(); await mk("Recusa", "reject", 1); await mk("OK", "ok", 2);
ok((await t(U, "study.generateSummary", { subjectId: s })).data?.summary, "passou para a próxima IA em vez de parar");

console.log("\nTodas recusam");
await clear(); await mk("Recusa A", "reject", 1); await mk("Recusa B", "reject", 2);
const sa = (await t(A, "subjects.create", { name: "x" })).data.id;
await t(A, "materials.createNote", { subjectId: sa, title: "n", content: "Ascaris vive no jejuno." });
const qu = await t(U, "study.generateQuiz", { subjectId: s, count: 5 }), qa = await t(A, "study.generateQuiz", { subjectId: sa, count: 5 });
ok(/Não foi possível gerar/.test(qu.error?.message ?? ""), "aluno vê a mensagem neutra de recusa", qu.error?.message);
ok(/Recusa A/.test(qa.error?.message ?? "") && /Recusa B/.test(qa.error?.message ?? ""), "admin vê o motivo de cada IA", qa.error?.message?.slice(0, 90));
const ev = (await t(A, "admin.recentAiEvents", null, true)).data;
ok(ev.some((e) => e.kind === "plano B" && e.provider === "Groq") && ev.some((e) => e.kind === "todas falharam"), "painel admin mostra as falhas e o plano B", JSON.stringify(ev.slice(0, 3)));
ok((await t(U, "admin.recentAiEvents", null, true)).error?.data?.code === "FORBIDDEN", "aluno não vê as falhas das IAs");
const usage = (await t(U, "account.usage", null, true)).data;
ok(usage.usage.generations === 5, "só as 5 gerações bem-sucedidas contaram (as que falharam, não)", JSON.stringify(usage.usage));
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
