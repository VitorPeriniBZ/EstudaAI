import fs from "node:fs";
import path from "node:path";
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "fixtures");
const B = process.env.AGENT_BASE_URL;
let pass = 0, fail = 0;
const ok = (cond, name, extra="") => { if (cond) { pass++; console.log("  ✔", name); } else { fail++; console.log("  ✘", name, extra); } };

function cookiesFrom(res) { return (res.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]); }

async function login(code, next = "/app") {
  const r1 = await fetch(B + "/api/auth/google?next=" + encodeURIComponent(next), { redirect: "manual" });
  const loc = new URL(r1.headers.get("location"));
  const oauthCookie = cookiesFrom(r1).join("; ");
  const state = loc.searchParams.get("state");
  const r2 = await fetch(`${B}/api/auth/google/callback?code=${code}&state=${state}`, { redirect: "manual", headers: { cookie: oauthCookie } });
  const sid = cookiesFrom(r2).find(c => c.startsWith("estudaai_sid=") && c.length > 20);
  return { r1, loc, r2, sid };
}
async function trpc(cookie, path, input, isQuery=false) {
  const url = `${B}/api/trpc/${path}` + (isQuery ? `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}` : "");
  const r = await fetch(url, { method: isQuery ? "GET" : "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: isQuery ? undefined : JSON.stringify({ json: input ?? null }) });
  const j = await r.json();
  return { status: r.status, data: j.result?.data?.json, error: j.error?.json };
}

console.log("\n1. Saúde e SPA");
ok((await (await fetch(B + "/api/health")).json()).ok === true, "GET /api/health → ok");
ok((await (await fetch(B + "/api/health/db")).json()).ok === true, "GET /api/health/db → ok (banco conectado)");
const spa = await fetch(B + "/app/materia/1", { headers: { accept: "text/html" } });
ok(spa.status === 200 && (await spa.text()).includes('<div id="root">'), "rota do React devolve index.html");

console.log("\n2. Login com Google");
const ana = await login("code-ana");
ok(ana.r1.status === 302 && ana.loc.origin === "http://localhost:4001" || ana.loc.pathname === "/o/oauth2/v2/auth", "redireciona para o Google");
ok(ana.loc.searchParams.get("redirect_uri") === B + "/api/auth/google/callback", "redirect_uri correto");
ok(ana.loc.searchParams.get("scope") === "openid email profile" && ana.loc.searchParams.get("code_challenge_method") === "S256", "scope + PKCE");
ok(ana.r2.status === 302 && ana.r2.headers.get("location") === "/app", "callback redireciona para /app", ana.r2.headers.get("location"));
ok(!!ana.sid, "cookie de sessão gravado");
const sidHeader = (cookiesFrom(ana.r2)).length ? ana.r2.headers.getSetCookie().find(c=>c.startsWith("estudaai_sid=")) : "";
ok(/HttpOnly/i.test(sidHeader) && /SameSite=Lax/i.test(sidHeader), "cookie httpOnly + SameSite=Lax");
const A = ana.sid;
let me = await trpc(A, "auth.me", undefined, true);
ok(me.data?.email === "ana@example.com" && me.data?.role === "admin", "primeiro usuário vira admin", JSON.stringify(me));
ok(me.data && !("googleSub" in me.data), "googleSub não vaza para o cliente");

const bad = await fetch(`${B}/api/auth/google/callback?code=code-ana&state=forjado`, { redirect: "manual" });
ok(bad.headers.get("location") === "/login?erro=sessao_expirada", "state inválido é rejeitado");
const denied = await fetch(`${B}/api/auth/google/callback?error=access_denied`, { redirect: "manual" });
ok(denied.headers.get("location") === "/login?erro=cancelado", "cancelamento volta ao login com aviso");
// open redirect: o navegador lê "/\site" como "//site"; o destino final tem que ser /app
for (const next of ["/\\exemplo.invalid", "//exemplo.invalid", "/\t/exemplo.invalid", "https://exemplo.invalid"]) {
  const r = await login("code-ana", next);
  ok(r.r2.status === 302 && r.r2.headers.get("location") === "/app", `?next=${JSON.stringify(next)} → /app`, r.r2.headers.get("location"));
}
ok((await login("code-ana", "/app/materia/7")).r2.headers.get("location") === "/app/materia/7", "?next interno é mantido");
const forged = await trpc("estudaai_sid=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.xxx", "auth.me", undefined, true);
ok(forged.data === null, "JWT forjado não autentica");

const bia = await login("code-bia"); const Bc = bia.sid;
me = await trpc(Bc, "auth.me", undefined, true);
ok(me.data?.role === "user", "segundo usuário é comum");
ok((await trpc(Bc, "admin.listProviders", undefined, true)).error?.data?.code === "FORBIDDEN", "usuário comum não acessa admin");
ok((await trpc(null, "subjects.list", undefined, true)).error?.data?.code === "UNAUTHORIZED", "sem login → UNAUTHORIZED");

console.log("\n3. Matérias, anotações e upload");
const subj = await trpc(A, "subjects.create", { name: "Parasitologia", color: "hema" });
ok(subj.data?.id > 0, "criar matéria"); const sid = subj.data.id;
const note = await trpc(A, "materials.createNote", { subjectId: sid, title: "Anotação", content: "Ascaris lumbricoides vive no jejuno e faz ciclo pulmonar." });
ok(note.data?.status === "ready", "criar anotação");
const pdf = fs.readFileSync(path.join(FIX, "aula.pdf"));
const up = await trpc(A, "materials.uploadFile", { subjectId: sid, name: "Aula Enterobius.pdf", contentBase64: pdf.toString("base64"), contentType: "application/pdf" });
ok(up.data?.status === "ready" && up.data.textContent.includes("Enterob"), "upload de PDF + texto extraído", JSON.stringify(up.error ?? up.data?.statusMsg));
const fu = await trpc(A, "materials.fileUrl", { id: up.data.id }, true);
ok(/^\/api\/files\/\d+$/.test(fu.data?.url), "fileUrl → rota /api/files/:id");
const fileRes = await fetch(B + fu.data.url, { headers: { cookie: A } });
const fileBytes = Buffer.from(await fileRes.arrayBuffer());
ok(fileRes.status === 200 && fileRes.headers.get("content-type") === "application/pdf" && fileBytes.equals(pdf), "arquivo servido do Postgres idêntico ao original");
ok((await fetch(B + fu.data.url)).status === 401, "arquivo sem login → 401");
ok((await fetch(B + fu.data.url, { headers: { cookie: Bc } })).status === 404, "arquivo de outro usuário → 404");
const big = Buffer.alloc(15 * 1024 * 1024 + 10, 1);
const bigUp = await trpc(A, "materials.uploadFile", { subjectId: sid, name: "grande.pdf", contentBase64: big.toString("base64"), contentType: "application/pdf" });
ok(bigUp.error?.message?.includes("15 MB"), "arquivo > 15 MB recusado", JSON.stringify(bigUp.error?.message));
const svg = await trpc(A, "materials.uploadFile", { subjectId: sid, name: "x.svg", contentBase64: Buffer.from("<svg/>").toString("base64"), contentType: "image/svg+xml" });
ok(svg.error?.data?.code === "BAD_REQUEST", "SVG recusado (evita XSS)");
ok((await trpc(Bc, "materials.list", { subjectId: sid }, true)).error?.data?.code === "NOT_FOUND", "matéria de outro usuário é invisível");

console.log("\n4. IA sem provedor");
const noAi = await trpc(A, "study.generateQuiz", { subjectId: sid, count: 5 });
ok(noAi.error?.data?.code === "PRECONDITION_FAILED" && noAi.error.message.includes("Admin"), "erro amigável orientando o admin", noAi.error?.message);
const png = fs.readFileSync(path.join(FIX, "foto.png"));
const img1 = await trpc(A, "materials.uploadFile", { subjectId: sid, name: "lousa.png", contentBase64: png.toString("base64"), contentType: "image/png" });
ok(img1.data?.status === "error" && img1.data.statusMsg.includes("imagens"), "imagem sem IA de visão → aviso amigável", img1.data?.statusMsg);

console.log("\n5. Provedores + failover");
const p1 = await trpc(A, "admin.createProvider", { name: "Falha (429)", type: "openai", apiKey: "sk-fail-123456789", baseUrl: "http://localhost:4002/fail/v1", model: "m1", priority: 1, vision: true });
const p2 = await trpc(A, "admin.createProvider", { name: "OK", type: "openai", apiKey: "sk-ok-123456789", baseUrl: "http://localhost:4002/ok/v1", model: "m2", priority: 5, vision: false });
ok(p1.data?.id && p2.data?.id, "cadastrar 2 provedores", JSON.stringify(p1.error ?? p2.error));
const list = await trpc(A, "admin.listProviders", undefined, true);
ok(list.data?.every(p => p.apiKey.includes("••••") && !p.apiKey.includes("fail-1234")), "chaves mascaradas na listagem");
const tst = await trpc(A, "admin.testProvider", { id: p2.data.id });
ok(tst.data?.ok === true, "testar provedor");
const quiz = await trpc(A, "study.generateQuiz", { subjectId: sid, count: 6 });
ok(quiz.data?.count === 6, "quiz gerado (via failover 429 → próximo)", JSON.stringify(quiz.error));
const stats = await (await fetch("http://localhost:4002/stats")).json();
ok(stats.fail >= 1 && stats.ok >= 1, "o primeiro provedor foi tentado e o segundo respondeu", JSON.stringify(stats));
const gq = await trpc(A, "study.getQuiz", { quizId: quiz.data.quizId }, true);
ok(gq.data?.questions.length === 6 && Array.isArray(gq.data.questions[0].options), "questões salvas (jsonb)");
const answers = Object.fromEntries(gq.data.questions.map(q => [String(q.id), q.answerIndex]));
const att = await trpc(A, "study.submitAttempt", { quizId: quiz.data.quizId, answers });
ok(att.data?.correct === 6, "enviar tentativa");
ok((await trpc(A, "study.generateSummary", { subjectId: sid })).data?.summary.includes("Ascaris"), "resumo");
ok((await trpc(A, "study.generateFlashcards", { subjectId: sid, count: 5 })).data?.count === 5, "flashcards");
const chat = await trpc(A, "study.chatSend", { subjectId: sid, message: "O que o oxiúros causa?" });
ok(chat.data?.answer.includes("prurido"), "chat de dúvidas");
ok((await trpc(A, "study.chatHistory", { subjectId: sid }, true)).data?.length === 2, "histórico do chat");
const sl = await trpc(A, "subjects.list", undefined, true);
ok(sl.data?.[0].counts.questions === 6 && sl.data[0].counts.flashcards === 5, "contagens da matéria");

// toggle não pode resetar prioridade/visão (bug corrigido)
await trpc(A, "admin.updateProvider", { id: p1.data.id, enabled: false });
const after = (await trpc(A, "admin.listProviders", undefined, true)).data.find(p => p.id === p1.data.id);
ok(after.enabled === false && after.priority === 1 && after.vision === true, "desativar mantém prioridade e visão", JSON.stringify(after));
await trpc(A, "admin.updateProvider", { id: p2.data.id, vision: true });
const re = await trpc(A, "materials.reprocess", { id: img1.data.id });
ok(re.data?.status === "ready" && re.data.textContent.includes("Ascaris"), "reprocessar imagem com IA de visão", JSON.stringify(re.error ?? re.data?.statusMsg));

// trocar o destino exige a chave de novo (senão a chave salva iria para um servidor qualquer ao clicar em "Testar")
const p3 = await trpc(A, "admin.createProvider", { name: "Destino", type: "openai", apiKey: "sk-destino-123456", baseUrl: "http://localhost:4002/ok/v1", model: "m3", priority: 50, enabled: false });
const semChave = await trpc(A, "admin.updateProvider", { id: p3.data.id, baseUrl: "http://localhost:4002/fail/v1" });
ok(semChave.error?.data?.code === "BAD_REQUEST" && /API key/.test(semChave.error.message), "trocar a Base URL sem a chave é recusado", JSON.stringify(semChave.error?.message));
const tipoSemChave = await trpc(A, "admin.updateProvider", { id: p3.data.id, type: "anthropic", baseUrl: "" });
ok(tipoSemChave.error?.data?.code === "BAD_REQUEST", "trocar o tipo sem a chave é recusado");
const p3Depois = (await trpc(A, "admin.listProviders", undefined, true)).data.find(p => p.id === p3.data.id);
ok(p3Depois.baseUrl === "http://localhost:4002/ok/v1" && p3Depois.type === "openai", "o provedor continua com o destino original", JSON.stringify(p3Depois));
const comoPainel = await trpc(A, "admin.updateProvider", { id: p3.data.id, name: "Destino 2", type: "openai", apiKey: "", baseUrl: "http://localhost:4002/ok/v1", model: "m3", vision: false, priority: 50, enabled: false });
ok(comoPainel.data?.ok === true, "editar só o nome (o painel reenvia a mesma Base URL) não pede a chave", JSON.stringify(comoPainel.error?.message));
const comChave = await trpc(A, "admin.updateProvider", { id: p3.data.id, baseUrl: "http://localhost:4002/fail/v1", apiKey: "sk-nova-123456789" });
ok(comChave.data?.ok === true, "trocar a Base URL informando a chave funciona", JSON.stringify(comChave.error?.message));
await trpc(A, "admin.deleteProvider", { id: p3.data.id });

console.log("\n6. Exclusões e logout");
ok((await trpc(A, "materials.remove", { id: up.data.id })).data?.ok, "excluir material");
ok((await fetch(B + fu.data.url, { headers: { cookie: A } })).status === 404, "arquivo apagado junto");
ok((await trpc(A, "subjects.remove", { id: sid })).data?.ok, "excluir matéria (transação)");
const lo = await fetch(B + "/api/trpc/auth.logout", { method: "POST", headers: { cookie: A, "content-type": "application/json" }, body: JSON.stringify({ json: null }) });
ok(lo.headers.getSetCookie().some(c => c.startsWith("estudaai_sid=;") && /Max-Age=0/i.test(c)), "logout apaga o cookie");

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
