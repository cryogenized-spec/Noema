"use client";

import { type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { transformObsidianTokens } from "@/lib/markdown/contract";

interface MarkdownRendererProps {
  content: string;
}

const getLanguage = (className?: string) => {
  const match = /language-([\w-]+)/.exec(className ?? "");
  return match?.[1] ?? "text";
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const rehypePlugins = useMemo(() => [rehypeHighlight], []);
  const transformed = useMemo(() => transformObsidianTokens(content), [content]);

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={{
        h1: ({ children }) => <h1 className="mb-2 mt-1 text-lg font-semibold text-slate-100">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-1 text-base font-semibold text-slate-100">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-1 text-sm font-semibold text-slate-100">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-100">{children}</p>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-violet-300/40 bg-slate-900/35 px-3 py-1 text-slate-300">
            {children}
          </blockquote>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 text-slate-100 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 text-slate-100 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ children, href }) => (
          <a href={href} className="text-violet-300 underline underline-offset-2" target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined}>
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-noema-borderSoft" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-noema-borderSoft">
            <table className="w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-900/70 text-slate-200">{children}</thead>,
        th: ({ children }) => <th className="border-b border-noema-borderSoft px-2 py-1 font-medium">{children}</th>,
        td: ({ children }) => <td className="border-b border-noema-borderSoft px-2 py-1 text-slate-300">{children}</td>,
        code: ({ className, children }) => {
          if (!className) {
            return <code className="rounded-md bg-black/35 px-1 py-0.5 text-[0.92em] text-slate-100">{children}</code>;
          }

          return <code className={className}>{children}</code>;
        },
        pre: ({ children }) => {
          const child = children as ReactNode;
          const normalized = Array.isArray(child) ? child[0] : child;

          if (!normalized || typeof normalized !== "object" || !("props" in normalized) || !normalized.props) {
            return <pre className="overflow-x-auto">{children}</pre>;
          }

          const className = (normalized.props as { className?: string }).className;
          const codeValue = String((normalized.props as { children?: ReactNode }).children ?? "").replace(/\n$/, "");
          const language = getLanguage(className);

          return (
            <div className="my-2 overflow-hidden rounded-xl border border-noema-borderSoft bg-slate-950/85">
              <div className="flex items-center justify-between border-b border-noema-borderSoft px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-300">
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
      {transformed}
    </ReactMarkdown>
  );
}
