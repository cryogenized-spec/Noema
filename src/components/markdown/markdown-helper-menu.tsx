"use client";

import { Icon } from "@iconify/react";
import type { MarkdownHelperAction } from "@/lib/markdown/authoring";

const actions: Array<{ action: MarkdownHelperAction; label: string; icon: string }> = [
  { action: "heading", label: "Heading", icon: "solar:text-bold" },
  { action: "bold", label: "Bold", icon: "solar:text-bold-bold" },
  { action: "italic", label: "Italic", icon: "solar:text-italic-bold" },
  { action: "bullet", label: "Bullet list", icon: "solar:list-bold" },
  { action: "checklist", label: "Checklist", icon: "solar:checklist-bold" },
  { action: "blockquote", label: "Quote", icon: "solar:quote-up-bold" },
  { action: "codeblock", label: "Code block", icon: "solar:code-bold" },
  { action: "link", label: "Link", icon: "solar:link-bold" },
  { action: "hr", label: "Divider", icon: "solar:minus-bold" },
];

interface MarkdownHelperMenuProps {
  onAction: (action: MarkdownHelperAction) => void;
}

export function MarkdownHelperMenu({ onAction }: MarkdownHelperMenuProps) {
  return (
    <div className="absolute bottom-14 left-2 z-20 w-44 rounded-xl border border-noema-border bg-noema-panel p-1 shadow-glass backdrop-blur-xl">
      <ul className="space-y-0.5">
        {actions.map((item) => (
          <li key={item.action}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-white/10"
              onClick={() => onAction(item.action)}
            >
              <Icon icon={item.icon} className="text-sm text-slate-300" />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
