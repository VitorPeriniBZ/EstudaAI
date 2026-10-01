/**
 * As IAs às vezes usam <br> dentro de tabelas e listas. Não renderizamos HTML
 * cru (segurança), então convertemos: dentro de linha de tabela vira " · ",
 * fora dela vira quebra de linha do Markdown.
 */
export function normalizeMarkdown(src: string): string {
  return src
    .split("\n")
    .map((line) =>
      /^\s*\|/.test(line)
        ? line.replace(/<br\s*\/?>/gi, " · ")
        : line.replace(/<br\s*\/?>/gi, "  \n"),
    )
    .join("\n");
}
