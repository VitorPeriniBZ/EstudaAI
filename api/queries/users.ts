import { eq, sql } from "drizzle-orm";
import { users, type User } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserById(id: number): Promise<User | undefined> {
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return rows.at(0);
}

type GoogleProfile = {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * Papel de um usuário novo.
 * - E-mails listados em ADMIN_EMAILS viram admin.
 * - O PRIMEIRO usuário do site só vira admin quando ADMIN_EMAILS está vazio: com a lista
 *   definida, quem entrar primeiro num banco novo (ou zerado) não ganha o painel de IAs.
 */
export function roleForNewUser(
  email: string | null,
  isFirstUser: boolean,
  adminEmails: string[],
): "admin" | "user" {
  if (email && adminEmails.includes(email.toLowerCase())) return "admin";
  return isFirstUser && adminEmails.length === 0 ? "admin" : "user";
}

/** Cria ou atualiza o usuário que entrou com o Google (papel inicial: roleForNewUser). */
export async function upsertGoogleUser(p: GoogleProfile): Promise<User> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // trava leve para evitar dois "primeiros usuários" simultâneos
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);

    const existing = await tx.select().from(users).where(eq(users.googleSub, p.sub)).limit(1);
    const forcedAdmin = !!p.email && env.adminEmails.includes(p.email.toLowerCase());

    if (existing[0]) {
      const [row] = await tx
        .update(users)
        .set({
          email: p.email,
          name: p.name,
          avatar: p.picture,
          lastSignInAt: new Date(),
          ...(forcedAdmin ? { role: "admin" as const } : {}),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      return row;
    }

    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
    const [row] = await tx
      .insert(users)
      .values({
        googleSub: p.sub,
        email: p.email,
        name: p.name,
        avatar: p.picture,
        role: roleForNewUser(p.email, count === 0, env.adminEmails),
        lastSignInAt: new Date(),
      })
      .returning();
    return row;
  });
}
