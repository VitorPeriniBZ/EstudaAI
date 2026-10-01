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
    if (host.endsWith(".render.com") || host.endsWith(".neon.tech")) return "require";
  } catch {
    // URL inválida: deixa o driver reclamar
  }
  return false;
}

/**
 * Parâmetros que só o libpq (psql) entende. O postgres.js repassaria esses
 * parâmetros ao servidor, que recusa a conexão ("unrecognized configuration
 * parameter"). A URL do Neon, por exemplo, vem com channel_binding=require.
 */
const LIBPQ_ONLY = ["channel_binding", "sslrootcert", "sslcert", "sslkey", "sslcrl", "gssencmode", "target_session_attrs_libpq"];

export function cleanDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const k of LIBPQ_ONLY) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return raw;
  }
}

let client: ReturnType<typeof postgres> | undefined;
let instance: ReturnType<typeof drizzle<typeof fullSchema>> | undefined;

export function getSql() {
  if (!client) {
    const url = cleanDatabaseUrl(env.databaseUrl);
    client = postgres(url, {
      ssl: sslFor(url),
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
