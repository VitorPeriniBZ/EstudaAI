# EstudaAí

Plataforma de estudos para universitários: login com Google, matérias, upload de
PDF/imagens/anotações e IA que gera resumo, quiz, flashcards e responde dúvidas.

**Stack:** React 19 + Vite + Tailwind · Hono + tRPC · Drizzle ORM + PostgreSQL ·
AI SDK (Anthropic e provedores OpenAI-compatíveis, com failover).

---

## Rodar no seu computador

Requisitos: Node 20.12+ (recomendado 22) e um PostgreSQL.

```bash
# Postgres rápido com Docker (opcional)
docker run -d --name estudaai-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=estudaai -p 5432:5432 postgres:16

cp .env.example .env      # preencha as variáveis (veja abaixo)
npm install
npm run db:migrate        # cria as tabelas
npm run dev               # http://localhost:3000
```

Build de produção local:

```bash
npm run build
npm start                 # serve o site (dist/public) + API na mesma porta
```

### Variáveis de ambiente

| Variável | Obrigatória | O que é |
|---|---|---|
| `DATABASE_URL` | sim | String do PostgreSQL (Neon, Render, Supabase…). |
| `APP_SECRET` | sim | Segredo do cookie de sessão. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `GOOGLE_CLIENT_ID` | sim | ID do cliente OAuth do Google |
| `GOOGLE_CLIENT_SECRET` | sim | Chave secreta do cliente OAuth |
| `APP_URL` | não | URL pública sem barra final. No Render usa `RENDER_EXTERNAL_URL` automaticamente; defina se usar domínio próprio. Local: `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | não | Se existir, cadastra o provedor Anthropic no primeiro start |
| `ANTHROPIC_MODEL` | não | Modelo desse cadastro automático (padrão `claude-sonnet-5`) |
| `ADMIN_EMAILS` | não | E-mails extras que viram admin (separados por vírgula) |

> O **primeiro usuário** que entrar vira **admin** e acessa `/app/admin` (provedores de IA).

---

## Configurar o login com Google

1. Acesse <https://console.cloud.google.com> e crie um projeto.
2. **APIs e serviços → Tela de consentimento OAuth**: tipo *Externo*, preencha nome do app,
   e-mail de suporte e e-mail do desenvolvedor. Escopos: `openid`, `email`, `profile`.
   Enquanto o app estiver em "Teste", só os e-mails em *Usuários de teste* conseguem entrar —
   publique o app para liberar para todos.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione:
   - `https://SEU-APP.onrender.com/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (para testar local)
5. Copie o **ID do cliente** e a **Chave secreta** para `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

O endereço precisa bater **exatamente** (https, sem barra no final). Se aparecer
`redirect_uri_mismatch`, confira esse campo.

---

## Deploy no Render

### Banco grátis no Neon

O Postgres grátis do Render expira; o do Neon não. Crie um projeto em
<https://neon.tech>, copie a **connection string** (já vem com `?sslmode=require`)
e use como `DATABASE_URL`.

### Opção A — Blueprint (mais rápido)

1. Suba este projeto para um repositório no GitHub (com `package.json` na raiz).
2. Render → **New → Blueprint** → escolha o repositório. O `render.yaml` cria o
   serviço web `estudaai` (plano grátis) e gera o `APP_SECRET`.
3. Preencha quando pedir: `DATABASE_URL` (Neon), `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` e, se quiser, `ANTHROPIC_API_KEY` e `ADMIN_EMAILS`.
4. Aguarde o deploy e siga para **Depois do deploy**.

### Opção B — Manual

1. Crie o banco no Neon e copie a connection string.
2. **New → Web Service** → conecte o repositório:
   - Runtime: **Node**
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
3. **Environment**: `DATABASE_URL`, `APP_SECRET`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` e, opcionalmente, `ANTHROPIC_API_KEY`.

### Migrations

Não precisa rodar nada: **as migrations são aplicadas automaticamente a cada start**
(veja `api/lib/migrate.ts`). Para rodar manualmente contra o banco do Render a partir
do seu computador, use a **External Database URL**:

```bash
DATABASE_URL="postgres://...render.com/estudaai" npm run db:migrate
```

### Evitar que o site "durma"

Crie um monitor grátis (ex.: UptimeRobot) chamando `https://SEU-APP.onrender.com/api/health`
a cada 10 minutos.

### IA grátis (Gemini)

Em **Admin → Provedores de IA → Adicionar**: tipo *OpenAI-compatível*, Base URL
`https://generativelanguage.googleapis.com/v1beta/openai/`, modelo `gemini-2.5-flash`
(ou o atual), **Lê imagens** ligado, chave gerada em <https://aistudio.google.com/apikey>.
Use **Testar** e gere um quiz para confirmar.

### Depois do deploy

1. Copie a URL gerada (ex.: `https://estudaai.onrender.com`) e confirme que
   `https://estudaai.onrender.com/api/auth/google/callback` está nos URIs do Google.
2. Abra `/api/health` → deve mostrar `{"ok":true}`.
3. Entre com o Google (a primeira conta vira admin).
4. Se não definiu `ANTHROPIC_API_KEY`, vá em **Admin → Provedores de IA** e cadastre uma chave.
5. Teste: criar matéria → enviar PDF → gerar quiz → chat.

### Limites do plano grátis (confira no site do Render)

- Com o Neon, o banco não expira, mas o espaço grátis é pequeno (cerca de 0,5 GB).
- O serviço web grátis "dorme" após ~15 min sem acesso; o primeiro acesso seguinte demora ~1 min.
- Os arquivos enviados ficam **dentro do Postgres** (tabela `files`) e contam no espaço do banco.

---

## Instalar como aplicativo

O site tem manifesto de PWA. No celular, abra o endereço e use
**Adicionar à tela inicial** (Android/Chrome: menu ⋮; iPhone/Safari: Compartilhar).
Ele abre em tela cheia com o ícone do EstudaAí.

---

## Estrutura

```
api/
  boot.ts              servidor Hono (rotas do Google, arquivos, health, tRPC, estáticos)
  auth/google.ts       login com Google (OAuth 2.0 + OpenID Connect, state + PKCE)
  auth/session.ts      JWT de sessão (cookie httpOnly)
  lib/storage.ts       arquivos no Postgres (bytea) — rota GET /api/files/:id
  lib/migrate.ts       migrations automáticas no boot
  ai/providers.ts      cadeia de IAs com failover + seed via ANTHROPIC_API_KEY
  ai/generate.ts       resumo, quiz, flashcards, chat, leitura de imagens/PDF
db/
  schema.ts            tabelas (PostgreSQL)
  migrations/          SQL gerado pelo drizzle-kit (versionado no git)
src/                   frontend React
render.yaml            blueprint do Render
```

Para alterar o banco: edite `db/schema.ts` → `npm run db:generate` → faça commit da
nova migration. Ela é aplicada no próximo deploy.

---

## Agente de testes

Um comando testa o app inteiro — login com Google, matérias, upload, IA com
failover, planos e limites, concorrência, chat e a interface no navegador — usando
servidores falsos do Google e das IAs (não gasta cota nem precisa de chave).

```bash
# 1. um banco SÓ para testes (o agente apaga as tabelas entre as baterias)
createdb estudaai_test        # ou: docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=estudaai_test -p 5432:5432 postgres:16

# 2. (opcional) interface no navegador
npm i -D playwright && npx playwright install chromium

# 3. rodar
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/estudaai_test npm run test:agent

# só algumas baterias:
TEST_DATABASE_URL=... npm run test:agent -- planos chat
```

- Recusa rodar se o nome do banco não tiver "test" — nunca aponte para o Neon de produção.
- Roda sozinho no GitHub a cada push (`.github/workflows/agente-de-testes.yml`), com um Postgres descartável.
- O relatório da última execução fica em `tests/agent/relatorio.json`.
- `npm run check:schemas` confere se os esquemas enviados às IAs funcionam no modo estrito (Groq/OpenAI).
