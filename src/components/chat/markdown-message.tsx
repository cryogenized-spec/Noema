"use client";

import { type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface MarkdownMessageProps {
  content: string;
}

const getLanguage = (className?: string) => {
  const match = /language-([\w-]+)/.exec(className ?? "");
  return match?.[1] ?? "text";
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const rehypePlugins = useMemo(() => [rehypeHighlight], []);

  return (
    <ReactMarkdown
      rehypePlugins={rehypePlugins}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
        code: ({ className, children }) => {
          if (!className) {
            return <code className="rounded-md bg-black/30 px-1 py-0.5 text-[0.92em]">{children}</code>;
          }

          return <code className={className}>{children}</code>;
        },
        pre: ({ children }) => {
          const child = children as ReactNode;
          const normalized = Array.isArray(child) ? child[0] : child;

          if (
            !normalized ||
            typeof normalized !== "object" ||
            !("props" in normalized) ||
            !normalized.props
          ) {
            return <pre className="overflow-x-auto">{children}</pre>;
          }

          const className = (normalized.props as { className?: string }).className;
          const codeValue = String((normalized.props as { children?: ReactNode }).children ?? "").replace(/\n$/, "");
          const language = getLanguage(className);

          return (
            <div className="my-2 overflow-hidden rounded-xl border border-white/15 bg-slate-950/80">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-300/90">
                <span>{language}</span>
                <button
                  type="button"
                  className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-200"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(codeValue);
                    } catch {
                      // Clipboard API may fail in non-secure contexts.
                    }
                  }}
                >
                  Copy
                </button>
              </div>
              <pre className="overflow-x-auto p-3 text-xs sm:text-sm">{children}</pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
