import path from "path";
import fs from "fs";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "../queries/connection";

/**
 * Aplica as migrations SQL de db/migrations (geradas com `npm run db:generate`).
 * Assim o deploy no Render cria/atualiza as tabelas sozinho, sem precisar de Shell.
 */
export async function runMigrations() {
  const folder = path.resolve(process.cwd(), "db/migrations");
  if (!fs.existsSync(path.join(folder, "meta", "_journal.json"))) {
    console.warn("[db] nenhuma migration encontrada em db/migrations — pulando");
    return;
  }
  const started = Date.now();
  await migrate(getDb(), { migrationsFolder: folder });
  console.log(`[db] migrations aplicadas (${Date.now() - started} ms)`);
}
