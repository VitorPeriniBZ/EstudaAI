// Interface no navegador (opcional): roda se o Playwright estiver instalado.
//   npm i -D playwright && npx playwright install chromium
const B = process.env.AGENT_BASE_URL; let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✔", n); } else { fail++; console.log("  ✘", n, x); } };
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  console.log("  – Playwright não instalado: interface pulada (npm i -D playwright && npx playwright install chromium)");
  console.log("\n0 ok, 0 falhas (pulado)"); process.exit(0);
}
async function sid(code) { const r1 = await fetch(B + "/api/auth/google", { redirect: "manual" });
  const c1 = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); const st = new URL(r1.headers.get("location")).searchParams.get("state");
  const r2 = await fetch(`${B}/api/auth/google/callback?code=${code}&state=${st}`, { redirect: "manual", headers: { cookie: c1 } });
  return r2.headers.getSetCookie().find((c) => c.startsWith("estudaai_sid=")).split(";")[0].split("=")[1]; }
async function t(v, p, input, q) { const url = `${B}/api/trpc/${p}` + (q ? `?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}` : "");
  const r = await fetch(url, { method: q ? "GET" : "POST", headers: { "content-type": "application/json", cookie: "estudaai_sid=" + v }, body: q ? undefined : JSON.stringify({ json: input ?? null }) });
  return (await r.json()).result?.data?.json; }

const A = await sid("code-ana"), U = await sid("code-bia");
await t(A, "admin.createProvider", { name: "OK", type: "openai", apiKey: "sk-ok-1234567", baseUrl: "http://localhost:4002/ok/v1", model: "m", priority: 1 });
const s = (await t(U, "subjects.create", { name: "Parasitologia" })).id;
await t(U, "materials.createNote", { subjectId: s, title: "n", content: "Ascaris vive no jejuno." });
const quiz = await t(U, "study.generateQuiz", { subjectId: s, count: 5 });
const qs = (await t(U, "study.getQuiz", { quizId: quiz.quizId }, true)).questions;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
await ctx.addCookies([{ name: "estudaai_sid", value: U, domain: new URL(B).hostname, path: "/" }]);
const pg = await ctx.newPage();
const errors = []; pg.on("pageerror", (e) => errors.push(e.message));
try {
  console.log("\nChat");
  await pg.goto(`${B}/app/materia/${s}`); await pg.getByText("Dúvidas", { exact: true }).first().click();
  await pg.getByPlaceholder(/Digite sua dúvida/).fill("monte uma tabela (demorado)");
  await pg.keyboard.press("Enter");
  await pg.waitForTimeout(400);
  ok(await pg.getByText("monte uma tabela (demorado)").isVisible(), "pergunta aparece na hora");
  ok(await pg.locator(".typing").first().isVisible(), "indicador de digitação enquanto espera");
  await pg.locator(".md table").waitFor({ timeout: 15000 });
  ok(await pg.locator(".md table tbody tr").count() === 2, "resposta em tabela renderizada como tabela");
  const cell = await pg.locator(".md table tbody tr").first().locator("td").nth(2).innerText();
  ok(cell.includes("·") && !cell.includes("<br"), "<br> não aparece cru na tabela", cell);
  ok(!(await pg.locator(".typing").count()), "indicador some quando a resposta chega");

  console.log("\nQuiz");
  await pg.getByText("Quiz", { exact: true }).first().click();
  await pg.getByRole("button", { name: "Gerar quiz com IA" }).click();
  await pg.getByRole("slider").focus(); await pg.keyboard.press("End"); await pg.waitForTimeout(300);
  ok((await pg.getByText(/Quantidade de questões:/).innerText()).includes("25"), "slider trava em 25 no Gratuito");
  ok(await pg.getByText(/50 PRO/).isVisible(), "mostra que vai até 50 com o PRO");
  await pg.keyboard.press("Escape");
  await pg.getByRole("button", { name: "Resolver" }).first().click();
  await pg.getByRole("button", { name: "Começar quiz" }).click();
  const answer = Object.fromEntries(qs.map((q) => [q.text, q.options[q.answerIndex]]));
  for (let i = 0; i < qs.length; i++) {
    const txt = await pg.locator("h3").first().innerText();
    const btns = pg.locator("button.opt-btn");
    for (let b = 0; b < (await btns.count()); b++) {
      if ((await btns.nth(b).locator("span").nth(1).innerText()).trim() === answer[txt]) { await btns.nth(b).click(); break; }
    }
    await pg.getByRole("button", { name: i === qs.length - 1 ? "Ver resultado" : "Próxima" }).click();
  }
  await pg.locator(".celebrate-text").waitFor({ timeout: 3000 });
  ok((await pg.locator(".celebrate-text").innerText()) === "PERFEITO", "mostra PERFEITO ao gabaritar");
  await pg.waitForTimeout(2300);
  ok(!(await pg.locator(".celebrate-text").count()), "PERFEITO some depois de 2 s");
  console.log("\nCor personalizada da matéria");
  await pg.goto(`${B}/app`);
  await pg.getByRole("button", { name: "Nova matéria" }).first().click();
  await pg.getByLabel("Nome da matéria").fill("Histologia");
  await pg.getByRole("button", { name: "Escolher outra cor" }).click();
  const area = pg.getByRole("slider", { name: "Saturação e brilho" });
  await area.waitFor();
  const ab = await area.boundingBox();
  await pg.mouse.click(ab.x + ab.width * 0.6, ab.y + ab.height * 0.4);
  const hb = await pg.getByRole("slider", { name: "Matiz" }).boundingBox();
  await pg.mouse.click(hb.x + hb.width * 0.33, hb.y + hb.height / 2); // verde
  const hex = await pg.getByLabel("Código da cor (hexadecimal)").inputValue();
  ok(/^#[0-9a-f]{6}$/.test(hex) && hex !== "#2c5f8a", "o seletor gera uma cor nova (quadrado + barra de matiz)", hex);
  await pg.getByRole("button", { name: "Usar esta cor" }).click();
  ok((await pg.getByRole("button", { name: `Cor personalizada ${hex}` }).getAttribute("aria-pressed")) === "true", "a cor nova aparece selecionada entre as bolinhas");
  await pg.getByRole("button", { name: "Criar matéria" }).click();
  await pg.waitForURL(/\/app\/materia\/\d+/);
  const stain = await pg.locator("div.stain-custom").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--stain").trim());
  ok(/^#[0-9a-f]{6}$/.test(stain), "a página da matéria usa a cor personalizada", stain);
  await pg.goto(`${B}/app`);
  await pg.locator(".slide-card.stain-custom").first().waitFor({ timeout: 5000 }).catch(() => {});
  ok((await pg.locator(".slide-card.stain-custom").count()) === 1, "o cartão no painel usa a cor personalizada");
  await pg.getByRole("button", { name: "Nova matéria" }).first().click();
  ok(await pg.getByRole("button", { name: `Cor personalizada ${hex}` }).isVisible(), "a cor usada antes aparece para as próximas matérias");
  await pg.keyboard.press("Escape");
  ok(errors.length === 0, "nenhum erro de JavaScript na página", errors.join(" | "));
} catch (e) { fail++; console.log("  ✘ erro na interface:", e.message); }
await browser.close();
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
