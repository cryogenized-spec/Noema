"use client";

import type { CSSProperties } from "react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  style?: CSSProperties;
}

export function MarkdownMessage({ content, className, style }: MarkdownMessageProps) {
  return (
    <div className={className} style={style}>
      <MarkdownRenderer content={content} />
    </div>
  );
}
