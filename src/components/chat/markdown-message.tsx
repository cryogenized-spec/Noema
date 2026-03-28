"use client";

import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return <MarkdownRenderer content={content} />;
}
