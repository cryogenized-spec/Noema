import type { ChatMessage } from "@/types/chat";

export type MessagePressContext =
  | { kind: "message" }
  | { kind: "code"; code: string; language: string }
  | { kind: "link"; href: string; text?: string };

export type ContextActionId =
  | "copy"
  | "reply_quote"
  | "translate"
  | "convert_note"
  | "share"
  | "ask_agent"
  | "summarize"
  | "rewrite_tone"
  | "extract_tasks"
  | "edit"
  | "delete"
  | "copy_code"
  | "copy_markdown"
  | "explain_code"
  | "save_code_note"
  | "open_link"
  | "copy_link"
  | "save_link"
  | "ask_agent_link";

export interface ContextActionItem {
  id: ContextActionId;
  label: string;
  description?: string;
  placeholder?: boolean;
  destructive?: boolean;
}

export interface ContextActionGroup {
  title: string;
  actions: ContextActionItem[];
}

const messageActions: ContextActionItem[] = [
  { id: "copy", label: "Copy" },
  { id: "reply_quote", label: "Reply / Quote" },
  { id: "translate", label: "Translate", placeholder: true, description: "Coming soon" },
  { id: "convert_note", label: "Convert to Note" },
  { id: "share", label: "Share" },
  { id: "ask_agent", label: "Ask Agent" },
  { id: "summarize", label: "Summarize" },
  { id: "rewrite_tone", label: "Rewrite in tone…", placeholder: true, description: "Coming soon" },
  { id: "extract_tasks", label: "Extract tasks" },
];

const ownMessageActions: ContextActionItem[] = [
  { id: "edit", label: "Edit" },
  { id: "delete", label: "Delete", destructive: true },
];

const codeActions: ContextActionItem[] = [
  { id: "copy_code", label: "Copy code" },
  { id: "copy_markdown", label: "Copy as markdown" },
  { id: "explain_code", label: "Explain code" },
  { id: "save_code_note", label: "Save to note", placeholder: true, description: "Coming soon" },
];

const linkActions: ContextActionItem[] = [
  { id: "open_link", label: "Open" },
  { id: "copy_link", label: "Copy link" },
  { id: "save_link", label: "Save to organizer", placeholder: true, description: "Coming soon" },
  { id: "ask_agent_link", label: "Ask agent about link" },
];

export function buildContextActionGroups(message: ChatMessage, context: MessagePressContext): ContextActionGroup[] {
  const groups: ContextActionGroup[] = [];

  if (context.kind === "message") {
    groups.push({ title: "Message", actions: messageActions });
    if (message.role === "user") {
      groups.push({ title: "Your message", actions: ownMessageActions });
    }
    return groups;
  }

  if (context.kind === "code") {
    groups.push({ title: "Code block", actions: codeActions });
    return groups;
  }

  groups.push({ title: "Link", actions: linkActions });
  return groups;
}
