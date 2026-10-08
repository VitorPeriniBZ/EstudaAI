#!/usr/bin/env node
/**
 * Agente de testes do EstudaAí.
 *
 *   TEST_DATABASE_URL=postgres://...estudaai_test npm run test:agent
 *
 * O que ele faz, sozinho:
 *  1. compila o app se ainda não houver build (dist/boot.js);
 *  2. sobe servidores falsos do Google (login) e de IAs (OpenAI-compatível com
 *     modo estrito, Gemini e um provedor com limite de tokens, como o Groq);
 *  3. inicia o app em modo produção apontando para eles;
 *  4. roda os testes de unidade e cada bateria com o banco zerado;
 *  5. imprime um relatório e sai com código 1 se algo falhar (serve para CI).
 *
 * Segurança: as tabelas são APAGADAS entre baterias. Por isso o agente só roda
 * se o nome do banco tiver "test" (ou com AGENT_ALLOW_ANY_DB=1).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const HERE = path.join(ROOT, "tests", "agent");
const PORT = Number(process.env.AGENT_PORT || 3999);
const BASE = `http://localhost:${PORT}`;
const DB_URL = process.env.TEST_DATABASE_URL;
const only = process.argv.slice(2); // ex.: npm run test:agent -- planos chat

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
const die = (msg) => { console.error(c.r("✘ " + msg)); process.exit(2); };

if (!DB_URL) die("Defina TEST_DATABASE_URL (um banco só para testes, ex.: postgres://postgres:postgres@localhost:5432/estudaai_test)");
const dbName = new URL(DB_URL).pathname.replace("/", "");
if (!/test/i.test(dbName) && process.env.AGENT_ALLOW_ANY_DB !== "1") {
  die(`O banco "${dbName}" não parece ser de teste. O agente apaga as tabelas! Use um banco com "test" no nome.`);
}

const children = [];
function start(cmd, args, env, name) {
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  p.logs = () => log;
  p.name = name;
  children.push(p);
  return p;
}
function cleanup() { for (const p of children) try { p.kill(); } catch { /* já saiu */ } }
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

async function waitFor(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/* ---------- 1. build ---------- */
if (!fs.existsSync(path.join(ROOT, "dist", "boot.js")) || process.env.AGENT_BUILD === "1") {
  console.log(c.d("• compilando o app (npm run build)…"));
  const b = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (b.status !== 0) die("build falhou");
}

/* ---------- 2. servidores falsos ---------- */
// portas ocupadas por outro processo fariam o agente conversar com o servidor errado
for (const port of [4001, 4002, 4003, 4004, PORT]) {
  const busy = await fetch(`http://localhost:${port}/`).then(() => true, () => false);
  if (busy) die(`a porta ${port} já está em uso por outro programa. Feche-o (ou rode outro agente que ficou aberto) e tente de novo.`);
}
const mockEnv = { AGENT_BASE_URL: BASE };
start("node", [path.join(HERE, "mocks", "google-e-ia.mjs")], mockEnv, "mock google/ia");
start("node", [path.join(HERE, "mocks", "gemini.mjs")], mockEnv, "mock gemini");
start("node", [path.join(HERE, "mocks", "limite-tokens.mjs")], mockEnv, "mock limite de tokens");
for (const [port, p] of [[4001, "/certs"], [4002, "/stats"], [4003, "/last"], [4004, "/stats"]]) {
  if (!(await waitFor(`http://localhost:${port}${p}`, 8000))) die(`servidor falso na porta ${port} não subiu (porta ocupada?)`);
}

/* ---------- 3. app ---------- */
const appEnv = {
  NODE_ENV: "production", PORT: String(PORT), DATABASE_URL: DB_URL,
  APP_SECRET: "agente-de-testes-0123456789abcdefghijklmnop", APP_URL: BASE,
  GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_TOKEN_URL: "http://localhost:4001/token", GOOGLE_JWKS_URL: "http://localhost:4001/certs",
  GOOGLE_ISSUER: "http://localhost:4001",
  ANTHROPIC_API_KEY: "", ADMIN_EMAILS: "", RENDER_EXTERNAL_URL: "",
  // os provedores de IA falsos rodam em localhost; em produção essa variável NUNCA existe
  AI_ALLOW_PRIVATE_BASEURL: "1",
};
const app = start("node", ["dist/boot.js"], appEnv, "app");
if (!(await waitFor(`${BASE}/api/health`))) { console.error(app.logs()); die("o app não subiu"); }
console.log(c.d(`• app em ${BASE}, banco "${dbName}"\n`));

/* ---------- 4. baterias ---------- */
const sql = postgres(DB_URL, { max: 1, onnotice: () => {}, ssl: /sslmode=require|neon\.tech|render\.com/.test(DB_URL) ? "require" : false });
async function resetDb() {
  const rows = await sql`select tablename from pg_tables where schemaname = 'public'`;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (tables) await sql.unsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

const suites = [
  { name: "unidade", cmd: "npx", args: ["tsx", "--tsconfig", path.join(HERE, "tsconfig.json"), path.join(HERE, "unidade.ts")], db: false },
  ...fs.readdirSync(path.join(HERE, "suites")).filter((f) => f.endsWith(".mjs")).sort()
    .map((f) => ({ name: f.replace(/^\d+-/, "").replace(/\.mjs$/, ""), cmd: "node", args: [path.join(HERE, "suites", f)], db: true })),
].filter((s) => !only.length || only.some((o) => s.name.includes(o)));

const results = [];
for (const s of suites) {
  if (s.db) await resetDb();
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, { cwd: ROOT, env: { ...process.env, AGENT_BASE_URL: BASE }, encoding: "utf8", timeout: 240_000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/(\d+) ok, (\d+) falhas/g)?.pop()?.match(/(\d+) ok, (\d+) falhas/);
  const okN = m ? Number(m[1]) : 0, failN = m ? Number(m[2]) : 1;
  const skipped = /pulado/.test(out);
  const passed = r.status === 0 && failN === 0;
  results.push({ name: s.name, ok: okN, fail: failN, passed, skipped, secs: ((Date.now() - t0) / 1000).toFixed(1) });
  const tag = skipped ? c.d("PULADO") : passed ? c.g("OK    ") : c.r("FALHOU");
  console.log(`${tag}  ${s.name.padEnd(18)} ${String(okN).padStart(3)} ok  ${failN ? c.r(failN + " falha(s)") : ""} ${c.d(results.at(-1).secs + "s")}`);
  if (!passed) console.log(process.env.AGENT_VERBOSE ? out : out.split("\n").filter((l) => /✘|Error|erro|^      /i.test(l)).map((l) => "        " + l).join("\n"));
  else if (skipped) console.log(c.d(out.split("\n").find((l) => l.includes("–")) || ""));
}
await sql.end();

/* ---------- 5. relatório ---------- */
const total = results.reduce((a, r) => a + r.ok, 0), failures = results.filter((r) => !r.passed);
console.log("\n" + c.b(failures.length ? c.r(`✘ ${failures.length} bateria(s) com falha`) : c.g(`✔ tudo certo: ${total} verificações em ${results.length} baterias`)));
fs.writeFileSync(path.join(HERE, "relatorio.json"), JSON.stringify({ quando: new Date().toISOString(), total, results }, null, 2));
if (failures.length && process.env.AGENT_VERBOSE) console.log(app.logs().slice(-4000));
process.exit(failures.length ? 1 : 0);
