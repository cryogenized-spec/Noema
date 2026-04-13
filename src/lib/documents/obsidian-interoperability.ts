import type { DocumentAttachmentRecord } from "@/types/attachments";
import type { CreateDocumentInput, DocumentRecord } from "@/types/documents";

export interface DocumentFrontmatter {
  title?: string;
  created?: string;
  updated?: string;
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

export interface ObsidianExportLayout {
  notesDir: string;
  assetsDir: string;
}

export interface PlannedDocumentExportFile {
  path: string;
  content: string;
}

export const DEFAULT_DOCUMENT_EXPORT_LAYOUT: ObsidianExportLayout = {
  notesDir: "Notes",
  assetsDir: "Assets",
};

const sanitizeYamlString = (value: string) => value.replace(/"/g, '\\"');
const toYamlValue = (value: string | string[]) =>
  Array.isArray(value) ? `[${value.map((item) => `"${sanitizeYamlString(item)}"`).join(", ")}]` : `"${sanitizeYamlString(value)}"`;

export const buildDocumentFrontmatter = (document: DocumentRecord): DocumentFrontmatter => ({
  title: document.title,
  created: document.createdAt,
  updated: document.updatedAt,
  tags: document.tags,
});

export const serializeDocumentFrontmatter = (frontmatter: DocumentFrontmatter): string => {
  const entries = Object.entries(frontmatter).filter(([, value]) => {
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return value.length > 0;
  });

  if (entries.length === 0) return "";
  const body = entries.map(([key, value]) => `${key}: ${toYamlValue(value as string | string[])}`).join("\n");
  return `---\n${body}\n---\n`;
};

export const renderDocumentAsMarkdown = (document: DocumentRecord): string => {
  const frontmatter = serializeDocumentFrontmatter(buildDocumentFrontmatter(document));
  const body = document.bodyMarkdown.trim();
  return `${frontmatter}${frontmatter ? "\n" : ""}${body}\n`;
};

const toFileSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";

export const buildDocumentFileName = (document: DocumentRecord) => `${document.updatedAt.slice(0, 10)}-${toFileSlug(document.title)}.md`;

export const prepareWikilinkTarget = (title: string) => `[[${title.trim()}]]`;
export const prepareEmbedTarget = (fileName: string) => `![[${fileName.trim()}]]`;

export const planDocumentsVaultExport = (
  documents: DocumentRecord[],
  attachments: DocumentAttachmentRecord[] = [],
  layout: ObsidianExportLayout = DEFAULT_DOCUMENT_EXPORT_LAYOUT,
): { layout: ObsidianExportLayout; files: PlannedDocumentExportFile[] } => {
  const noteFiles = documents.map((document) => ({
    path: `${layout.notesDir}/${buildDocumentFileName(document)}`,
    content: renderDocumentAsMarkdown(document),
  }));

  const assetPlaceholders = attachments.map((asset) => ({
    path: `${layout.assetsDir}/${asset.fileName}`,
    content: `# Placeholder for ${asset.fileName}\nlocalRef: ${asset.localRef}\nmimeType: ${asset.mimeType}\n`,
  }));

  return {
    layout,
    files: [...noteFiles, ...assetPlaceholders],
  };
};

const parseYamlArray = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
};

export const parseImportedMarkdownDocument = (content: string): { frontmatter?: DocumentFrontmatter; bodyMarkdown: string } => {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("---\n")) {
    return { bodyMarkdown: normalized };
  }

  const closing = normalized.indexOf("\n---\n", 4);
  if (closing === -1) {
    return { bodyMarkdown: normalized };
  }

  const yamlBlock = normalized.slice(4, closing).trim();
  const bodyMarkdown = normalized.slice(closing + 5).trim();
  const frontmatter: DocumentFrontmatter = {};

  for (const line of yamlBlock.split("\n")) {
    const [rawKey, ...rawValueParts] = line.split(":");
    if (!rawKey || rawValueParts.length === 0) continue;
    const key = rawKey.trim();
    const rawValue = rawValueParts.join(":").trim();
    if (!rawValue) continue;

    if (rawValue.startsWith("[")) {
      frontmatter[key] = parseYamlArray(rawValue);
    } else {
      frontmatter[key] = rawValue.replace(/^"|"$/g, "");
    }
  }

  return { frontmatter, bodyMarkdown };
};

export const prepareImportedDocumentDraft = (content: string): CreateDocumentInput => {
  const parsed = parseImportedMarkdownDocument(content);
  return {
    title: parsed.frontmatter?.title || "Imported Document",
    bodyMarkdown: parsed.bodyMarkdown,
    tags: parsed.frontmatter?.tags ?? ["import"],
    sourceType: "import",
    frontmatterEnabled: Boolean(parsed.frontmatter),
    sourceRef: {
      importId: `import-${Date.now()}`,
    },
  };
};
