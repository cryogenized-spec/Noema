import type { DocumentAttachmentRecord } from "@/types/attachments";

const OBSIDIAN_EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;
const MARKDOWN_LINK_REGEX = /\[[^\]]+\]\(([^)]+)\)/g;

export interface DocumentAttachmentReference {
  kind: "obsidian_embed" | "markdown_link";
  target: string;
}

export const extractDocumentAttachmentReferences = (bodyMarkdown: string): DocumentAttachmentReference[] => {
  const refs: DocumentAttachmentReference[] = [];

  for (const match of bodyMarkdown.matchAll(OBSIDIAN_EMBED_REGEX)) {
    refs.push({ kind: "obsidian_embed", target: match[1].trim() });
  }

  for (const match of bodyMarkdown.matchAll(MARKDOWN_LINK_REGEX)) {
    const target = match[1].trim();
    if (!target || target.startsWith("http") || target.startsWith("noema://")) continue;
    refs.push({ kind: "markdown_link", target });
  }

  return refs;
};

export const resolveAttachmentByTarget = (
  attachments: DocumentAttachmentRecord[],
  target: string,
): DocumentAttachmentRecord | undefined => {
  const normalized = target.trim().toLowerCase();
  return attachments.find((asset) => asset.fileName.toLowerCase() === normalized || asset.localRef.toLowerCase() === normalized);
};
