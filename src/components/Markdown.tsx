import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdown } from "@/lib/markdown";

/** Renderiza Markdown (com tabelas, listas de tarefas e riscado) no estilo do app. */
function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // tabelas largas rolam dentro da própria caixa, sem quebrar o layout
          table: ({ node: _n, ...props }) => (
            <div className="md-table">
              <table {...props} />
            </div>
          ),
          a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {normalizeMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}

const Markdown = memo(MarkdownImpl);
export default Markdown;
