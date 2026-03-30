import type { CreateDocumentInput, DocumentSourceRef } from "@/types/documents";
import { normalizeWikilinks } from "@/lib/notes/conversion";
import { normalizeMarkdownSource } from "@/lib/markdown/contract";

export interface OcrIntakeMetadata {
  titleHint?: string;
  tags?: string[];
  sourceRef?: DocumentSourceRef;
}

export interface OcrCleanupStage {
  name: string;
  transform: (rawText: string) => string;
}

const defaultCleanupStage: OcrCleanupStage = {
  name: "normalize_whitespace",
  transform: (rawText) =>
    rawText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
};

export const prepareOcrDocumentDraft = (
  rawText: string,
  metadata: OcrIntakeMetadata = {},
  cleanupStage: OcrCleanupStage = defaultCleanupStage,
): CreateDocumentInput => {
  const cleaned = cleanupStage.transform(rawText);
  const markdownBody = normalizeWikilinks(normalizeMarkdownSource(cleaned));

  return {
    title: metadata.titleHint?.trim() || "OCR Draft",
    bodyMarkdown: markdownBody,
    tags: Array.from(new Set(["noema", "ocr", ...(metadata.tags ?? [])])),
    sourceType: "ocr",
    sourceRef: {
      ocrCapturedAt: new Date().toISOString(),
      ...metadata.sourceRef,
    },
  };
};

export const OCR_CLEANUP_EXTENSION_NOTE =
  "Future AI cleanup can replace defaultCleanupStage with structure-aware markdown transformation.";
