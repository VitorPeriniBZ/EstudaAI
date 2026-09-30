/**
 * npm run db:seed — aplica as migrations e cadastra o provedor Anthropic
 * a partir de ANTHROPIC_API_KEY (o mesmo que o servidor faz ao iniciar).
 */
import { runMigrations } from "../api/lib/migrate";
import { seedProvidersFromEnv } from "../api/ai/providers";
import { getSql } from "../api/queries/connection";

async function seed() {
  await runMigrations();
  await seedProvidersFromEnv();
  console.log("Pronto.");
  await getSql().end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
