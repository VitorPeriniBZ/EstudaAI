/**
 * Armazenamento de arquivos no próprio PostgreSQL (tabela `files`, coluna bytea).
 *
 * Mantém a mesma interface usada antes (uploadFile / readFile / deleteFile /
 * getPresignedUrl). A "URL" agora é uma rota do próprio app, GET /api/files/:id,
 * que exige login e só entrega o arquivo ao dono.
 */
import { and, eq } from "drizzle-orm";
import { files } from "@db/schema";
import { getDb } from "../queries/connection";

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export class StorageError extends Error {
  readonly code: "TOO_LARGE" | "EMPTY" | "NOT_FOUND";
  constructor(code: "TOO_LARGE" | "EMPTY" | "NOT_FOUND", message: string) {
    super(message);
    this.code = code;
    this.name = "StorageError";
  }
}

function parseKey(key: string): number {
  const id = Number(key);
  if (!Number.isInteger(id) || id <= 0) {
    throw new StorageError("NOT_FOUND", "Arquivo não encontrado");
  }
  return id;
}

export const storage = {
  async uploadFile(input: {
    userId: number;
    fileContent: Uint8Array;
    fileName: string;
    contentType: string;
  }): Promise<{ key: string; size: number; contentType: string }> {
    const size = input.fileContent.byteLength;
    if (size === 0) throw new StorageError("EMPTY", "Arquivo vazio.");
    if (size > MAX_FILE_BYTES) {
      throw new StorageError("TOO_LARGE", "Arquivo muito grande (máx. 15 MB).");
    }
    const [row] = await getDb()
      .insert(files)
      .values({
        userId: input.userId,
        name: input.fileName.slice(0, 255),
        contentType: input.contentType || "application/octet-stream",
        size,
        data: Buffer.from(input.fileContent),
      })
      .returning({ id: files.id });
    return { key: String(row.id), size, contentType: input.contentType };
  },

  async readFile(input: { fileKey: string }): Promise<Uint8Array> {
    const rows = await getDb()
      .select({ data: files.data })
      .from(files)
      .where(eq(files.id, parseKey(input.fileKey)))
      .limit(1);
    if (!rows[0]) throw new StorageError("NOT_FOUND", "Arquivo não encontrado");
    return new Uint8Array(rows[0].data);
  },

  /** Busca bytes + metadados garantindo que o arquivo é do usuário. */
  async getOwnedFile(fileKey: string, userId: number) {
    const rows = await getDb()
      .select()
      .from(files)
      .where(and(eq(files.id, parseKey(fileKey)), eq(files.userId, userId)))
      .limit(1);
    return rows[0];
  },

  async deleteFile(input: { fileKey: string }): Promise<boolean> {
    await getDb().delete(files).where(eq(files.id, parseKey(input.fileKey)));
    return true;
  },

  /** Não há URL assinada: o arquivo é servido pela rota autenticada do app. */
  async getPresignedUrl(input: { key: string; download?: boolean }): Promise<{ key: string; url: string }> {
    const url = `/api/files/${parseKey(input.key)}${input.download ? "?download=1" : ""}`;
    return { key: input.key, url };
  },
};
