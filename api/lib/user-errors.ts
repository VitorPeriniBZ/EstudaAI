/**
 * Erros com duas versões de mensagem:
 *  - `message`      → detalhe técnico (só o admin vê)
 *  - `userMessage`  → texto neutro para o usuário comum
 *
 * O errorFormatter do tRPC (api/middleware.ts) escolhe qual enviar conforme o
 * papel de quem fez a requisição. Assim nenhum detalhe de configuração, nome de
 * provedor ou erro interno chega a um usuário que não é admin.
 */
import { TRPCError } from "@trpc/server";

export const UserMessages = {
  aiUnavailable:
    "Os recursos de IA estão temporariamente indisponíveis. Tente novamente mais tarde.",
  aiBusy: "A IA está sobrecarregada no momento. Tente novamente em alguns instantes.",
  aiRejected:
    "Não foi possível gerar esse conteúdo a partir do seu material. Tente reformular ou enviar outro material.",
  imageUnavailable:
    "A leitura de imagens está temporariamente indisponível. Tente novamente mais tarde ou envie o conteúdo como PDF ou anotação.",
  fileProcessing: "Não foi possível processar este arquivo. Tente novamente mais tarde.",
  generic: "Algo deu errado. Tente novamente em instantes.",
} as const;

export class UserFacingCause extends Error {
  readonly userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.name = "UserFacingCause";
    this.userMessage = userMessage;
  }
}

export function dualError(
  code: TRPCError["code"],
  adminMessage: string,
  userMessage: string,
): TRPCError {
  return new TRPCError({ code, message: adminMessage, cause: new UserFacingCause(userMessage) });
}

/** Mensagem para gravar/mostrar conforme o papel. */
export function messageFor(err: unknown, isAdmin: boolean, fallback: string): string {
  const adminMsg = err instanceof Error ? err.message : String(err);
  if (isAdmin) return (adminMsg || fallback).slice(0, 500);
  const cause = (err as { cause?: unknown })?.cause;
  if (cause instanceof UserFacingCause) return cause.userMessage;
  return fallback;
}
