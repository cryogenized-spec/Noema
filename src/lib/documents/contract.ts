import { MARKDOWN_STORAGE_CONTRACT, normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { CreateDocumentInput, DocumentRecord } from "@/types/documents";

const normalizeTags = (tags?: string[]) => {
  if (!tags) return [];
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
};

export function createDocumentRecord(input: CreateDocumentInput): Omit<DocumentRecord, "id"> {
  const now = new Date().toISOString();
  return {
    title: input.title.trim() || "Untitled",
    bodyMarkdown: normalizeMarkdownSource(input.bodyMarkdown),
    summary: input.summary?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    tags: normalizeTags(input.tags),
    folderId: input.folderId,
    isPinned: input.isPinned ?? false,
    isArchived: input.isArchived ?? false,
    sourceType: input.sourceType ?? "manual",
    sourceRef: input.sourceRef,
    frontmatterEnabled: input.frontmatterEnabled ?? false,
  };
}

export const DOCUMENT_MARKDOWN_CONTRACT = MARKDOWN_STORAGE_CONTRACT;
