import ReactMarkdown from "react-markdown";

/** Renderiza Markdown com o estilo tipográfico do app. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
