import type { ChatMessage } from "@/types/chat";
import type { CanonicalMarkdownNote } from "@/types/notes";

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "note";

const truncate = (value: string, max = 48) => (value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`);

export const OBSIDIAN_DEFAULTS = {
  notesDir: "Notes",
  assetsDir: "Assets",
  attachmentEmbedPrefix: "![[Assets/",
} as const;

export function normalizeWikilinks(markdown: string): string {
  return markdown
    .replace(/\[\[\s+/g, "[[")
    .replace(/\s+\]\]/g, "]]")
    .replace(/!\[\[\s+/g, "![[")
    .replace(/\s+\]\]/g, "]]");
}

export function prepareAttachmentEmbed(fileName: string, folder = OBSIDIAN_DEFAULTS.assetsDir): string {
  return `![[${folder}/${fileName}]]`;
}

export function createNoteFromSingleMessage(message: ChatMessage): CanonicalMarkdownNote {
  const createdAt = message.createdAt;
  const titleBase = truncate(message.content.replace(/\s+/g, " "), 42);
  const title = titleBase || `Message ${new Date(createdAt).toLocaleDateString()}`;

  return {
    title,
    body: normalizeWikilinks(message.content),
    createdAt,
    updatedAt: new Date().toISOString(),
    tags: ["noema", "chat", message.role],
    source: {
      type: "single_message",
      messageIds: message.id !== undefined ? [message.id] : [],
    },
  };
}

export function createNoteFromMessageSelection(messages: ChatMessage[], title = "Chat Selection Note"): CanonicalMarkdownNote {
  const createdAt = new Date().toISOString();
  const body = messages
    .map((message, index) => {
      const stamp = new Date(message.createdAt).toLocaleString();
      return `## ${index + 1}. ${message.role.toUpperCase()} · ${stamp}\n\n${normalizeWikilinks(message.content)}`;
    })
    .join("\n\n");

  return {
    title,
    body,
    createdAt,
    updatedAt: createdAt,
    tags: ["noema", "chat", "selection"],
    source: {
      type: "message_selection",
      messageIds: messages.flatMap((message) => (message.id !== undefined ? [message.id] : [])),
    },
  };
}

export function buildNoteFilename(note: CanonicalMarkdownNote): string {
  const datePart = note.createdAt.slice(0, 10);
  return `${datePart}-${toSlug(note.title)}.md`;
}
