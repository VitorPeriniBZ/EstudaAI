// Auditoria visual do site inteiro (opcional: precisa do Playwright).
// Percorre todas as telas em celular e computador, tema claro e escuro, e
// procura: sobreposição de botões, conteúdo sob o círculo decorativo, texto
// cortado, rolagem lateral, plurais errados/"undefined", alvos de toque
// pequenos, imagens quebradas e erros de JavaScript.
//   AGENT_SHOTS=1 salva capturas em tests/agent/auditoria/
import fs from "node:fs";
import path from "node:path";
const B = process.env.AGENT_BASE_URL; let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✔", n); } else { fail++; console.log("  ✘", n, x); } };
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  console.log("  – Playwright não instalado: auditoria visual pulada");
  console.log("\n0 ok, 0 falhas (pulado)"); process.exit(0);
}
const SHOTS = process.env.AGENT_SHOTS ? path.join(path.dirname(new URL(import.meta.url).pathname), "..", "auditoria") : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

async function sid(code) { const r1 = await fetch(B + "/api/auth/google", { redirect: "manual" });
  const c1 = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); const st = new URL(r1.headers.get("location")).searchParams.get("state");
  const r2 = await fetch(`${B}/api/auth/google/callback?code=${code}&state=${st}`, { redirect: "manual", headers: { cookie: c1 } });
  return r2.headers.getSetCookie().find((c) => c.startsWith("estudaai_sid=")).split(";")[0].split("=")[1]; }
async function t(v, p, input) { const r = await fetch(`${B}/api/trpc/${p}`, { method: "POST", headers: { "content-type": "application/json", cookie: "estudaai_sid=" + v }, body: JSON.stringify({ json: input ?? null }) });
  return (await r.json()).result?.data?.json; }

/* ---------- dados realistas ---------- */
const A = await sid("code-ana"), U = await sid("code-bia");
await t(A, "admin.createProvider", { name: "OK", type: "openai", apiKey: "sk-ok-1234567", baseUrl: "http://localhost:4002/ok/v1", model: "m", priority: 1, vision: true });
const sa = (await t(A, "subjects.create", { name: "Parasitologia Humana e Medicina Tropical — Turma B", description: "Matéria com nome longo de propósito" })).id;
for (let i = 1; i <= 4; i++) await t(A, "materials.createNote", { subjectId: sa, title: `Aula ${i}: Enterobius vermicularis, Schistosoma mansoni e Ascaris lumbricoides`, content: "Ascaris vive no jejuno. Enterobius causa prurido anal noturno. ".repeat(20) });
await t(A, "study.generateQuiz", { subjectId: sa, count: 10 });
await t(A, "study.generateQuiz", { subjectId: sa, count: 5 });
await t(A, "study.generateFlashcards", { subjectId: sa, count: 5 });
await t(A, "study.generateSummary", { subjectId: sa });
await t(A, "study.chatSend", { subjectId: sa, message: "monte uma tabela comparando" });
const su = (await t(U, "subjects.create", { name: "Bio" })).id;
await t(U, "materials.createNote", { subjectId: su, title: "Nota", content: "Ascaris vive no jejuno." });
await t(U, "study.generateQuiz", { subjectId: su, count: 5 }); // 1 quiz → testa singular

/* ---------- checagens rodadas dentro da página ---------- */
const AUDIT = () => {
  const issues = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
  const name = (el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  // escopo: se há um diálogo aberto, audita só ele
  const dialog = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find(vis);
  const root = dialog || document.body;
  const ctrls = [...root.querySelectorAll('button, a[href], [role="button"], input, textarea, select, [role="slider"], [role="tab"]')]
    .filter(vis).filter((el) => !el.closest("[aria-hidden='true']"));

  // 1. rolagem lateral
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`rolagem lateral: página com ${document.documentElement.scrollWidth}px em tela de ${innerWidth}px`);
  // 2. controles sobrepostos
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const a = ctrls[i], b = ctrls[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (inter(ra, rb) > 16) issues.push(`sobreposição: "${name(a)}" × "${name(b)}"`);
  }
  // 3. conteúdo sob o círculo decorativo
  for (const body of root.querySelectorAll(".slide-body")) {
    if (!vis(body)) continue;
    const cs = getComputedStyle(body, "::after"); if (cs.content === "none") continue;
    const br = body.getBoundingClientRect(), size = parseFloat(cs.width), right = parseFloat(cs.right);
    const circ = { left: br.right - right - size, right: br.right - right, top: br.top + br.height / 2 - size / 2, bottom: br.top + br.height / 2 + size / 2 };
    for (const el of body.querySelectorAll("*")) {
      if (!vis(el) || el.children.length > 0 && !el.matches("button,a")) continue;
      if (!(el.innerText?.trim() || el.matches("button,a,svg,input"))) continue;
      if (inter(el.getBoundingClientRect(), circ) > 6) { issues.push(`sob o círculo decorativo: "${name(el)}"`); break; }
    }
  }
  // 4. texto cortado (sem reticências intencionais)
  for (const el of root.querySelectorAll("h1,h2,h3,h4,p,span,button,a,label,td,th,li")) {
    if (!vis(el) || !el.innerText?.trim() || el.closest(".sr-only")) continue; // texto só para leitor de tela
    const cs = getComputedStyle(el);
    const clips = /(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflow);
    if (clips && cs.textOverflow !== "ellipsis" && !el.className.toString().includes("truncate") && el.scrollWidth > el.clientWidth + 2)
      issues.push(`texto cortado: "${name(el)}"`);
  }
  // 5. textos com problema
  const txt = root.innerText;
  for (const [re, what] of [
    [/\b1 (questões|materiais|quizzes|flashcards|cartões|acertos|arquivos|matérias|usuários|erradas|perguntas restantes)\b/, "plural errado"],
    [/\b\w+\((s|es|is|zes|ões)\)/, "plural com parênteses"],
    [/\bundefined\b|\bNaN\b|\[object Object\]/, "valor quebrado na tela"],
  ]) { const m = txt.match(re); if (m) issues.push(`${what}: "${m[0]}"`); }
  // 6. alvo de toque pequeno (celular, WCAG 2.5.8: 24×24)
  if (innerWidth < 500) for (const el of ctrls) {
    if (el.closest("p, li") && el.tagName === "A") continue; // link dentro de texto
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) issues.push(`alvo de toque pequeno (${Math.round(r.width)}×${Math.round(r.height)}): "${name(el)}"`);
  }
  // 7. rótulos para leitor de tela em inglês num app em português
  for (const el of root.querySelectorAll(".sr-only, [aria-label]")) {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim();
    if (/^(close|next|previous|more|toggle|open|search|loading|submit|cancel|dismiss)\b/i.test(t)) issues.push(`rótulo em inglês: "${t}"`);
  }
  // 8. imagens quebradas
  for (const img of root.querySelectorAll("img")) if (vis(img) && img.complete && img.naturalWidth === 0) issues.push(`imagem quebrada: ${img.src.slice(0, 60)}`);
  return [...new Set(issues)];
};

/* ---------- telas ---------- */
const browser = await chromium.launch();
const all = [];
async function audit(label, pg) {
  await pg.waitForTimeout(450);
  const issues = await pg.evaluate(AUDIT);
  for (const i of issues) all.push(`${label} → ${i}`);
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, label.replace(/[^\w-]+/g, "_") + ".png"), fullPage: true });
}
for (const vp of [{ n: "celular", width: 390, height: 844 }, { n: "computador", width: 1280, height: 800 }]) {
  for (const theme of ["light", "dark"]) {
    const tag = `${vp.n}/${theme === "light" ? "claro" : "escuro"}`;
    for (const who of [["visitante", null], ["admin", A], ["aluna", U]]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await ctx.addInitScript((th) => localStorage.setItem("estudaai-theme", th), theme);
      if (who[1]) await ctx.addCookies([{ name: "estudaai_sid", value: who[1], domain: new URL(B).hostname, path: "/" }]);
      const pg = await ctx.newPage(); const errs = [];
      pg.on("pageerror", (e) => errs.push(e.message));
      pg.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
      const L = (s) => `${tag}/${who[0]}/${s}`;
      if (!who[1]) {
        for (const [p, s] of [["/", "inicio"], ["/login", "login"], ["/login?erro=cancelado", "login-erro"], ["/privacidade", "privacidade"], ["/termos", "termos"], ["/nao-existe", "404"]]) { await pg.goto(B + p); await audit(L(s), pg); }
      } else {
        const sub = who[0] === "admin" ? sa : su;
        await pg.goto(B + "/app"); await audit(L("painel"), pg);
        await pg.goto(`${B}/app/materia/${sub}`); await audit(L("materiais"), pg);
        for (const tab of ["Resumo", "Quiz", "Flashcards", "Dúvidas"]) { await pg.getByText(tab, { exact: true }).first().click(); await audit(L(tab.toLowerCase()), pg); }
        await pg.getByText("Quiz", { exact: true }).first().click();
        await pg.getByRole("button", { name: "Gerar quiz com IA" }).click(); await audit(L("dialogo-quiz"), pg); await pg.keyboard.press("Escape");
        await pg.getByRole("button", { name: "Resolver" }).first().click(); await audit(L("quiz-temas"), pg);
        await pg.getByRole("button", { name: "Começar quiz" }).click(); await pg.locator("button.opt-btn").first().click(); await audit(L("quiz-questao"), pg);
        await pg.getByRole("button", { name: "Encerrar" }).click(); await pg.waitForTimeout(2300); await audit(L("quiz-resultado"), pg);
        await pg.getByText("Flashcards", { exact: true }).first().click();
        await pg.getByRole("button", { name: /Gerar flashcards|Gerar mais/ }).first().click(); await audit(L("dialogo-flashcards"), pg); await pg.keyboard.press("Escape");
        if (who[0] === "aluna") { await pg.goto(B + "/app"); await pg.getByRole("button", { name: "Conhecer o PRO" }).click(); await audit(L("dialogo-pro"), pg); await pg.keyboard.press("Escape"); }
        if (who[0] === "admin") {
          await pg.goto(B + "/app/admin"); await audit(L("admin-provedores"), pg);
          await pg.getByRole("tab", { name: "Usuários" }).click(); await audit(L("admin-usuarios"), pg);
        }
      }
      for (const e of [...new Set(errs)]) all.push(`${tag}/${who[0]} → erro de JavaScript: ${e.slice(0, 120)}`);
      await ctx.close();
    }
  }
}
await browser.close();

const byKind = {};
for (const i of all) { const k = i.split(" → ")[1].split(":")[0]; (byKind[k] ??= []).push(i); }
const kinds = ["rolagem lateral", "sobreposição", "sob o círculo decorativo", "texto cortado", "plural errado", "plural com parênteses", "valor quebrado na tela", "alvo de toque pequeno", "rótulo em inglês", "imagem quebrada", "erro de JavaScript"];
console.log(`\n${all.length ? all.length + " problema(s) encontrados" : "nenhum problema"} em 2 tamanhos × 2 temas × 3 usuários\n`);
for (const k of kinds) {
  const list = byKind[k] ?? [];
  ok(list.length === 0, k, list.length ? `(${list.length})\n      ` + list.slice(0, 8).join("\n      ") + (list.length > 8 ? `\n      … +${list.length - 8}` : "") : "");
}
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
