import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
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
} from "../db/schema";

export async function requireSubject(subjectId: number, userId: number) {
  const row = await getDb().query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.userId, userId)),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Matéria não encontrada" });
  return row;
}

export const SUBJECT_COLORS = ["hema", "giemsa", "lugol", "madder", "neutral"] as const;

export const subjectsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.query.subjects.findMany({
      where: eq(subjects.userId, ctx.user.id),
      orderBy: desc(subjects.createdAt),
    });
    // contagens por matéria
    const result = await Promise.all(
      rows.map(async (s) => {
        const [mats, qzs, cards] = await Promise.all([
          db.query.materials.findMany({ where: eq(materials.subjectId, s.id) }),
          db.query.quizzes.findMany({ where: eq(quizzes.subjectId, s.id) }),
          db.query.flashcards.findMany({ where: eq(flashcards.subjectId, s.id) }),
        ]);
        const questionCount = (
          await db.query.questions.findMany({ where: eq(questions.subjectId, s.id) })
        ).length;
        return {
          ...s,
          counts: {
            materials: mats.length,
            materialsReady: mats.filter((m) => m.status === "ready").length,
            quizzes: qzs.length,
            questions: questionCount,
            flashcards: cards.length,
          },
        };
      }),
    );
    return result;
  }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(160),
        description: z.string().max(2000).optional(),
        color: z.enum(SUBJECT_COLORS).default("hema"),
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
        .$returningId();
      return getDb().query.subjects.findFirst({ where: eq(subjects.id, id) });
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(160).optional(),
        description: z.string().max(2000).nullable().optional(),
        color: z.enum(SUBJECT_COLORS).optional(),
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
