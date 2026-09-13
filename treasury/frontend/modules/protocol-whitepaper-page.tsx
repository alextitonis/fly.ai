import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function WhitepaperPage() {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/SHIT_FINANCE_WHITEPAPER.md")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-6 py-20">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-2/3 rounded-lg bg-surface-a5" />
          <div className="h-4 w-full rounded bg-surface-a5" />
          <div className="h-4 w-full rounded bg-surface-a5" />
          <div className="h-4 w-3/4 rounded bg-surface-a5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Whitepaper unavailable</h1>
        <p className="text-secondary-t">Could not load the whitepaper. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-6 py-12">
      <div className="prose-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-4xl font-bold mb-6 text-primary-t">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-2xl font-bold mt-10 mb-4 text-primary-t border-b border-a10-b pb-2">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-xl font-semibold mt-6 mb-3 text-primary-t">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-lg font-semibold mt-4 mb-2 text-primary-t">{children}</h4>
            ),
            p: ({ children }) => (
              <p className="text-base leading-relaxed mb-4 text-secondary-t">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-2 mb-4 text-secondary-t">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-2 mb-4 text-secondary-t">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="text-base leading-relaxed">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-primary-t">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-secondary-t">{children}</em>
            ),
            a: ({ href, children }) => (
              <a href={href} className="text-green underline hover:text-green/80 transition-colors" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            hr: () => (
              <hr className="my-8 border-a10-b" />
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-green/40 pl-4 my-4 italic text-secondary-t">{children}</blockquote>
            ),
            code: ({ children }) => (
              <code className="font-mono text-sm bg-surface-a5 px-1.5 py-0.5 rounded text-primary-t">{children}</code>
            ),
            pre: ({ children }) => (
              <pre className="bg-surface-a5 rounded-lg p-4 overflow-x-auto my-4 border border-a10-b">{children}</pre>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="w-full border-collapse border border-a10-b text-sm">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-a10-b px-3 py-2 bg-surface-a5 font-semibold text-primary-t text-left">{children}</th>
            ),
            td: ({ children }) => (
              <td className="border border-a10-b px-3 py-2 text-secondary-t">{children}</td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
