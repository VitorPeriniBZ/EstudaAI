import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  subjects,
  materials,
  quizzes,
  questions,
  quizAttempts,
  flashcards,
  chatMessages,
  files,
} from "../db/schema";

export async function requireSubject(subjectId: number, userId: number) {
  const row = await getDb().query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Matéria não encontrada" });
  return row;
}

export const SUBJECT_COLORS = ["hema", "giemsa", "lugol", "madder", "neutral"] as const;

/**
 * Cor da matéria: uma das prontas ou personalizada no formato #rrggbb (guardada em
 * minúsculas). O formato é conferido à risca porque a cor vira variável de CSS na tela.
 */
const subjectColor = z.union([
  z.enum(SUBJECT_COLORS),
  z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").transform((c) => c.toLowerCase()),
]);

/**
 * count(*) dos registros de `table` ligados à matéria da linha atual (subconsulta correlacionada).
 * Nomes qualificados à mão: o drizzle escreve as colunas sem a tabela dentro do select, e
 * "subjectId" = "id" seria resolvido inteiro na tabela da subconsulta.
 */
function countBySubject(table: "materials" | "quizzes" | "questions" | "flashcards", onlyReady = false) {
  const ready = onlyReady ? sql` and t."status" = 'ready'` : sql``;
  return sql<number>`(select count(*)::int from ${sql.identifier(table)} t where t."subjectId" = ${subjects}."id"${ready})`.mapWith(Number);
}

/**
 * Matérias do usuário com as contagens, numa consulta só.
 * Antes eram 4 consultas por matéria trazendo linhas inteiras — inclusive o texto
 * extraído de todos os materiais — só para contar.
 */
export function subjectsWithCounts(userId: number) {
  return getDb()
    .select({
      // sem o resumo (markdown grande): a aba Resumo usa subjects.get
      id: subjects.id,
      userId: subjects.userId,
      name: subjects.name,
      description: subjects.description,
      color: subjects.color,
      summaryAt: subjects.summaryAt,
      createdAt: subjects.createdAt,
      nMaterials: countBySubject("materials"),
      nMaterialsReady: countBySubject("materials", true),
      nQuizzes: countBySubject("quizzes"),
      nQuestions: countBySubject("questions"),
      nFlashcards: countBySubject("flashcards"),
    })
    .from(subjects)
    .where(eq(subjects.userId, userId))
    .orderBy(desc(subjects.createdAt));
}

export const subjectsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const rows = await subjectsWithCounts(ctx.user.id);
    return rows.map(({ nMaterials, nMaterialsReady, nQuizzes, nQuestions, nFlashcards, ...s }) => ({
      ...s,
      counts: {
        materials: nMaterials,
        materialsReady: nMaterialsReady,
        quizzes: nQuizzes,
        questions: nQuestions,
        flashcards: nFlashcards,
      },
    }));
  }),

  /** Uma matéria completa, com o resumo (aba Resumo). */
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => requireSubject(input.id, ctx.user.id)),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(160),
        description: z.string().max(2000).optional(),
        color: subjectColor.default("hema"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(subjects)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          color: input.color,
        })
        .returning({ id: subjects.id });
      return getDb().query.subjects.findFirst({ where: eq(subjects.id, id) });
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(160).optional(),
        description: z.string().max(2000).nullable().optional(),
        color: subjectColor.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSubject(input.id, ctx.user.id);
      const { id, ...patch } = input;
      await getDb().update(subjects).set(patch).where(eq(subjects.id, id));
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireSubject(input.id, ctx.user.id);
      const db = getDb();
      await db.transaction(async (tx) => {
        // arquivos (bytea) dos materiais desta matéria
        const withFiles = await tx
          .select({ fileKey: materials.fileKey })
          .from(materials)
          .where(and(eq(materials.subjectId, input.id), isNotNull(materials.fileKey)));
        const fileIds = withFiles.map((m) => Number(m.fileKey)).filter((n) => Number.isInteger(n) && n > 0);
        if (fileIds.length) {
          await tx.delete(files).where(and(inArray(files.id, fileIds), eq(files.userId, ctx.user.id)));
        }
        await tx.delete(chatMessages).where(eq(chatMessages.subjectId, input.id));
        await tx.delete(flashcards).where(eq(flashcards.subjectId, input.id));
        await tx.delete(quizAttempts).where(eq(quizAttempts.subjectId, input.id));
        await tx.delete(questions).where(eq(questions.subjectId, input.id));
        await tx.delete(quizzes).where(eq(quizzes.subjectId, input.id));
        await tx.delete(materials).where(eq(materials.subjectId, input.id));
        await tx.delete(subjects).where(eq(subjects.id, input.id));
      });
      return { ok: true };
    }),
});
