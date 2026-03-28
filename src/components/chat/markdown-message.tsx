'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { Icon } from '@iconify/react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownMessageProps {
  content: string;
}

function InlineCode(props: ComponentPropsWithoutRef<'code'>) {
  return <code className="rounded-md bg-white/10 px-1 py-0.5 text-[0.9em]" {...props} />;
}

function CodeBlock({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const language = className?.replace('language-', '') ?? '';
  const code = String(children).replace(/\n$/, '');

  if (!className) {
    return <InlineCode {...props}>{children}</InlineCode>;
  }

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-noema-stroke bg-[#0a1022]">
      <div className="flex items-center justify-between border-b border-noema-stroke/70 px-3 py-2 text-xs text-noema-muted">
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(code)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/10"
        >
          <Icon icon="solar:copy-linear" className="text-sm" /> Copy
        </button>
      </div>
      <pre className="noema-scrollbar overflow-x-auto px-3 py-3 text-sm">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="prose-code prose prose-invert max-w-none prose-p:my-2 prose-p:text-sm prose-headings:my-2 prose-headings:text-base">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={{ code: CodeBlock }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
