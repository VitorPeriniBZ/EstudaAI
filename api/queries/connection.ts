import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

/**
 * SSL: a Internal Database URL do Render (mesma região) não usa SSL;
 * a External URL (acesso de fora, ex.: seu Mac) exige. Detectamos pelo host
 * ou por ?sslmode=require na própria URL.
 */
function sslFor(url: string): "require" | false {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) return "require";
  try {
    const host = new URL(url).hostname;
    if (host.endsWith(".render.com")) return "require";
  } catch {
    // URL inválida: deixa o driver reclamar
  }
  return false;
}

let client: ReturnType<typeof postgres> | undefined;
let instance: ReturnType<typeof drizzle<typeof fullSchema>> | undefined;

export function getSql() {
  if (!client) {
    client = postgres(env.databaseUrl, {
      ssl: sslFor(env.databaseUrl),
      max: 10,
      idle_timeout: 30,
      onnotice: () => {},
    });
  }
  return client;
}

export function getDb() {
  if (!instance) {
    instance = drizzle(getSql(), { schema: fullSchema });
  }
  return instance;
}
