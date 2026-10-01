// Chat: ordem pergunta → resposta, histórico e limpeza
const B = process.env.AGENT_BASE_URL; let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✔", n); } else { fail++; console.log("  ✘", n, x); } };
async function login(code) { const r1 = await fetch(B + "/api/auth/google", { redirect: "manual" });
  const c1 = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); const st = new URL(r1.headers.get("location")).searchParams.get("state");
  const r2 = await fetch(`${B}/api/auth/google/callback?code=${code}&state=${st}`, { redirect: "manual", headers: { cookie: c1 } });
  return r2.headers.getSetCookie().find((c) => c.startsWith("estudaai_sid=")).split(";")[0]; }
async function t(ck, p, input, q) { const url = `${B}/api/trpc/${p}` + (q ? `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}` : "");
  const r = await fetch(url, { method: q ? "GET" : "POST", headers: { "content-type": "application/json", cookie: ck }, body: q ? undefined : JSON.stringify({ json: input ?? null }) });
  const j = await r.json(); return { data: j.result?.data?.json, error: j.error?.json }; }
const A = await login("code-ana");
await t(A, "admin.createProvider", { name: "OK", type: "openai", apiKey: "sk-ok-1234567", baseUrl: "http://localhost:4002/ok/v1", model: "m", priority: 1 });
const s = (await t(A, "subjects.create", { name: "Chat" })).data.id;
await t(A, "materials.createNote", { subjectId: s, title: "n", content: "Ascaris vive no jejuno." });
for (let i = 0; i < 3; i++) await t(A, "study.chatSend", { subjectId: s, message: "dúvida " + i });
const h = (await t(A, "study.chatHistory", { subjectId: s }, true)).data;
ok(h.length === 6, "6 mensagens no histórico");
ok(h.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")), "ordem pergunta → resposta");
ok(h[0].content === "dúvida 0" && h[4].content === "dúvida 2", "perguntas na ordem em que foram feitas");
const list = (await t(A, "materials.list", { subjectId: s }, true)).data;
ok(list.length === 1 && !("textContent" in list[0]) && list[0].textLength > 0, "lista de materiais não envia o texto completo");
await t(A, "study.chatClear", { subjectId: s });
ok((await t(A, "study.chatHistory", { subjectId: s }, true)).data.length === 0, "limpar conversa");
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
