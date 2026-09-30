import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { materials } from "../db/schema";
import { storage, MAX_FILE_BYTES } from "./lib/storage";
import { extractPdfText, extractImageText } from "./ai/generate";
import { requireSubject } from "./subjects-router";

/** Mensagem amigável para gravar em materials.statusMsg */
function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return (msg || "Falha ao processar o arquivo").slice(0, 500);
}

async function extractTextFor(
  kind: "pdf" | "image",
  fileKey: string,
  mimeType: string,
): Promise<string> {
  const bytes = await storage.readFile({ fileKey });
  if (kind === "pdf") {
    const text = await extractPdfText(bytes);
    if (text.length >= 40) return text;
    // PDF escaneado (sem camada de texto) não é suportado na extração simples
    throw new Error(
      "Este PDF parece ser escaneado (sem texto selecionável). Envie fotos das páginas como imagem ou digite uma anotação.",
    );
  }
  return extractImageText(bytes, mimeType);
}

export const materialsRouter = createRouter({
  list: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      return getDb().query.materials.findMany({
        where: eq(materials.subjectId, input.subjectId),
        orderBy: desc(materials.createdAt),
      });
    }),

  /** Upload de PDF ou imagem (base64). Extrai o texto e salva o arquivo no storage. */
  uploadFile: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        name: z.string().min(1).max(255),
        contentBase64: z.string(),
        contentType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);

      const isPdf =
        input.contentType === "application/pdf" || /\.pdf$/i.test(input.name);
      const isImage = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(input.contentType);
      if (!isPdf && !isImage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Formato não suportado. Envie PDF ou imagem (PNG, JPG, WebP, GIF, HEIC).",
        });
      }
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      if (bytes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
      }
      if (bytes.length > MAX_FILE_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo muito grande (máx. 15 MB).",
        });
      }

      const kind = isPdf ? "pdf" : "image";
      const saved = await storage.uploadFile({
        userId: ctx.user.id,
        fileContent: bytes,
        fileName: input.name,
        contentType: input.contentType || (isPdf ? "application/pdf" : "image/jpeg"),
      });

      const [{ id }] = await getDb()
        .insert(materials)
        .values({
          subjectId: input.subjectId,
          userId: ctx.user.id,
          kind,
          title: input.name,
          fileKey: saved.key,
          fileSize: saved.size,
          status: "processing",
        })
        .returning({ id: materials.id });

      // Extração inline (rápida para imagens; PDFs de texto também são rápidos)
      try {
        const text = await extractTextFor(kind, saved.key, input.contentType);
        await getDb()
          .update(materials)
          .set({ textContent: text, status: "ready", statusMsg: null })
          .where(eq(materials.id, id));
      } catch (err) {
        await getDb()
          .update(materials)
          .set({ status: "error", statusMsg: errorMessage(err) })
          .where(eq(materials.id, id));
      }

      return getDb().query.materials.findFirst({ where: eq(materials.id, id) });
    }),

  /** Anotação digitada/coplada pelo estudante */
  createNote: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        title: z.string().min(1).max(255),
        content: z.string().min(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSubject(input.subjectId, ctx.user.id);
      const [{ id }] = await getDb()
        .insert(materials)
        .values({
          subjectId: input.subjectId,
          userId: ctx.user.id,
          kind: "note",
          title: input.title,
          textContent: input.content,
          status: "ready",
        })
        .returning({ id: materials.id });
      return getDb().query.materials.findFirst({ where: eq(materials.id, id) });
    }),

  /** Reprocessar um material que falhou na extração */
  reprocess: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const row = await db.query.materials.findFirst({
        where: and(eq(materials.id, input.id), eq(materials.userId, ctx.user.id)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.kind === "note" || !row.fileKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Anotações não precisam de reprocessamento." });
      }
      await db.update(materials).set({ status: "processing" }).where(eq(materials.id, row.id));
      try {
        const stored = await storage.getOwnedFile(row.fileKey, ctx.user.id);
        const text = await extractTextFor(
          row.kind as "pdf" | "image",
          row.fileKey,
          stored?.contentType ?? (row.kind === "pdf" ? "application/pdf" : "image/jpeg"),
        );
        await db
          .update(materials)
          .set({ textContent: text, status: "ready", statusMsg: null })
          .where(eq(materials.id, row.id));
      } catch (err) {
        await db
          .update(materials)
          .set({ status: "error", statusMsg: errorMessage(err) })
          .where(eq(materials.id, row.id));
      }
      return db.query.materials.findFirst({ where: eq(materials.id, row.id) });
    }),

  /** URL temporária para visualizar o arquivo original */
  fileUrl: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const row = await getDb().query.materials.findFirst({
        where: and(eq(materials.id, input.id), eq(materials.userId, ctx.user.id)),
      });
      if (!row || !row.fileKey) throw new TRPCError({ code: "NOT_FOUND" });
      const { url } = await storage.getPresignedUrl({ key: row.fileKey });
      return { url };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const row = await db.query.materials.findFirst({
        where: and(eq(materials.id, input.id), eq(materials.userId, ctx.user.id)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.fileKey) {
        try {
          await storage.deleteFile({ fileKey: row.fileKey });
        } catch {
          // se o arquivo já não existir, segue a remoção do registro
        }
      }
      await db.delete(materials).where(eq(materials.id, row.id));
      return { ok: true };
    }),
});
