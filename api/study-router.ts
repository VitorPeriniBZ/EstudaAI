import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { requireSubject } from "./subjects-router";
import {
  buildContext,
  generateQuizFromContext,
  generateSummaryFromContext,
  generateFlashcardsFromContext,
  chatReply,
} from "./ai/generate";

/** Monta o contexto de estudo com todos os materiais prontos da matéria. */
async function subjectContext(subjectId: number) {
  const mats = await getDb().query.materials.findMany({
    where: and(eq(materials.subjectId, subjectId), eq(materials.status, "ready")),
  });
  // ignora materiais repetidos (o mesmo PDF enviado duas vezes)
  const seen = new Set<string>();
  const texts = mats
    .map((m) => m.textContent ?? "")
    .filter((t) => {
      const key = createHash("sha1").update(t.replace(/\s+/g, " ").trim()).digest("hex");
      if (!t.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (texts.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Nenhum material pronto ainda. Envie um PDF, imagem ou anotação e aguarde o processamento.",
    });
  }
  return buildContext(texts);
}

export const studyRouter = createRouter({
  /* ---------------- Resumo ---------------- */

  generateSummary: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const subject = await requireSubject(input.subjectId, ctx.user.id);
      const context = await subjectContext(input.subjectId);
      const summary = await generateSummaryFromContext(context, subject.name);
      await getDb()
        .update(subjects)
        .set({ summary, summaryAt: new Date() })
        .where(eq(subjects.id, input.subjectId));
      return { summary };
    }),

  /* ---------------- Quiz ---------------- */

  generateQuiz: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        count: z.number().int().min(5).max(25).default(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const subject = await requireSubject(input.subjectId, ctx.user.id);
      const context = await subjectContext(input.subjectId);
      const generated = await generateQuizFromContext(
        context,
        subject.name,
        input.count,
      );
      const db = getDb();
      const [{ id: quizId }] = await db
        .insert(quizzes)
        .values({
          subjectId: input.subjectId,
          userId: ctx.user.id,
          title: generated.title || `Quiz de ${subject.name}`,
        })
        .returning({ id: quizzes.id });
      await db.insert(questions).values(
        generated.questions.map((q) => ({
          quizId,
          subjectId: input.subjectId,
          topic: q.topic.slice(0, 160),
          text: q.question,
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
        })),
      );
      return { quizId, count: generated.questions.length };
    }),

  listQuizzes: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      const db = getDb();
      const rows = await db.query.quizzes.findMany({
        where: eq(quizzes.subjectId, input.subjectId),
        orderBy: desc(quizzes.createdAt),
      });
      return Promise.all(
        rows.map(async (q) => {
          const qs = await db.query.questions.findMany({
            where: eq(questions.quizId, q.id),
          });
          const attempts = await db.query.quizAttempts.findMany({
            where: eq(quizAttempts.quizId, q.id),
            orderBy: desc(quizAttempts.createdAt),
          });
          return {
            ...q,
            questionCount: qs.length,
            topics: [...new Set(qs.map((x) => x.topic))],
            bestScore: attempts.length
              ? Math.max(...attempts.map((a) => (a.total ? a.correct / a.total : 0)))
              : null,
            attemptCount: attempts.length,
          };
        }),
      );
    }),

  getQuiz: authedQuery
    .input(z.object({ quizId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const quiz = await db.query.quizzes.findFirst({
        where: and(eq(quizzes.id, input.quizId), eq(quizzes.userId, ctx.user.id)),
      });
      if (!quiz) throw new TRPCError({ code: "NOT_FOUND" });
      const qs = await db.query.questions.findMany({
        where: eq(questions.quizId, quiz.id),
      });
      return { quiz, questions: qs };
    }),

  deleteQuiz: authedQuery
    .input(z.object({ quizId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const quiz = await db.query.quizzes.findFirst({
        where: and(eq(quizzes.id, input.quizId), eq(quizzes.userId, ctx.user.id)),
      });
      if (!quiz) throw new TRPCError({ code: "NOT_FOUND" });
      await db.transaction(async (tx) => {
        await tx.delete(quizAttempts).where(eq(quizAttempts.quizId, quiz.id));
        await tx.delete(questions).where(eq(questions.quizId, quiz.id));
        await tx.delete(quizzes).where(eq(quizzes.id, quiz.id));
      });
      return { ok: true };
    }),

  submitAttempt: authedQuery
    .input(
      z.object({
        quizId: z.number(),
        /** respostas: questionId -> índice escolhido */
        answers: z.record(z.string(), z.number()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const quiz = await db.query.quizzes.findFirst({
        where: and(eq(quizzes.id, input.quizId), eq(quizzes.userId, ctx.user.id)),
      });
      if (!quiz) throw new TRPCError({ code: "NOT_FOUND" });
      const qs = await db.query.questions.findMany({
        where: eq(questions.quizId, quiz.id),
      });
      let correct = 0;
      const wrong: number[] = [];
      for (const q of qs) {
        const chosen = input.answers[String(q.id)];
        if (chosen === undefined) continue;
        if (chosen === q.answerIndex) correct++;
        else wrong.push(q.id);
      }
      const total = Object.keys(input.answers).length;
      if (total === 0) throw new TRPCError({ code: "BAD_REQUEST" });
      await db.insert(quizAttempts).values({
        quizId: quiz.id,
        subjectId: quiz.subjectId,
        userId: ctx.user.id,
        total,
        correct,
        wrongQuestionIds: wrong,
      });
      return { total, correct, wrongQuestionIds: wrong };
    }),

  /** Questões que o estudante errou na última tentativa (para revisão) */
  lastWrongQuestions: authedQuery
    .input(z.object({ quizId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const last = await db.query.quizAttempts.findFirst({
        where: and(
          eq(quizAttempts.quizId, input.quizId),
          eq(quizAttempts.userId, ctx.user.id),
        ),
        orderBy: desc(quizAttempts.createdAt),
      });
      if (!last || last.wrongQuestionIds.length === 0) return [];
      return db.query.questions.findMany({
        where: inArray(questions.id, last.wrongQuestionIds),
      });
    }),

  attempts: authedQuery
    .input(z.object({ quizId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getDb().query.quizAttempts.findMany({
        where: and(
          eq(quizAttempts.quizId, input.quizId),
          eq(quizAttempts.userId, ctx.user.id),
        ),
        orderBy: desc(quizAttempts.createdAt),
      });
    }),

  /* ---------------- Flashcards ---------------- */

  generateFlashcards: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        count: z.number().int().min(5).max(30).default(15),
        replace: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const subject = await requireSubject(input.subjectId, ctx.user.id);
      const context = await subjectContext(input.subjectId);
      const cards = await generateFlashcardsFromContext(
        context,
        subject.name,
        input.count,
      );
      const db = getDb();
      if (input.replace) {
        await db.delete(flashcards).where(eq(flashcards.subjectId, input.subjectId));
      }
      await db.insert(flashcards).values(
        cards.map((c) => ({
          subjectId: input.subjectId,
          userId: ctx.user.id,
          front: c.front,
          back: c.back,
        })),
      );
      return { count: cards.length };
    }),

  listFlashcards: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      return getDb().query.flashcards.findMany({
        where: eq(flashcards.subjectId, input.subjectId),
        orderBy: desc(flashcards.createdAt),
      });
    }),

  setMastery: authedQuery
    .input(z.object({ id: z.number(), mastery: z.number().int().min(0).max(2) }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(flashcards)
        .set({ mastery: input.mastery })
        .where(
          and(eq(flashcards.id, input.id), eq(flashcards.userId, ctx.user.id)),
        );
      return { ok: true };
    }),

  clearFlashcards: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      await getDb()
        .delete(flashcards)
        .where(eq(flashcards.subjectId, input.subjectId));
      return { ok: true };
    }),

  /* ---------------- Chat de dúvidas ---------------- */

  chatHistory: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      const rows = await getDb().query.chatMessages.findMany({
        where: eq(chatMessages.subjectId, input.subjectId),
        orderBy: desc(chatMessages.createdAt),
      });
      return rows.reverse();
    }),

  chatSend: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        message: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const subject = await requireSubject(input.subjectId, ctx.user.id);
      const context = await subjectContext(input.subjectId);
      const db = getDb();
      const historyRows = await db.query.chatMessages.findMany({
        where: eq(chatMessages.subjectId, input.subjectId),
        orderBy: desc(chatMessages.createdAt),
      });
      const history = historyRows.reverse().slice(-10);
      const answer = await chatReply(
        context,
        subject.name,
        history.map((h) => ({ role: h.role, content: h.content })),
        input.message,
      );
      await db.insert(chatMessages).values([
        {
          subjectId: input.subjectId,
          userId: ctx.user.id,
          role: "user",
          content: input.message,
        },
        {
          subjectId: input.subjectId,
          userId: ctx.user.id,
          role: "assistant",
          content: answer,
        },
      ]);
      return { answer };
    }),

  chatClear: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      await getDb()
        .delete(chatMessages)
        .where(eq(chatMessages.subjectId, input.subjectId));
      return { ok: true };
    }),
});
