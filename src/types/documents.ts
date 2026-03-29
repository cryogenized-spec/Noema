export type DocumentSourceType = "manual" | "chat_conversion" | "ocr" | "import";

export interface DocumentSourceRef {
  chatMessageIds?: number[];
  ocrJobId?: string;
  ocrEngine?: string;
  ocrCapturedAt?: string;
  importId?: string;
  [key: string]: string | number[] | undefined;
}

export interface DocumentRecord {
  id?: number;
  title: string;
  bodyMarkdown: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  folderId?: string;
  isPinned: boolean;
  isArchived: boolean;
  sourceType: DocumentSourceType;
  sourceRef?: DocumentSourceRef;
  frontmatterEnabled?: boolean;
}

export interface CreateDocumentInput {
  title: string;
  bodyMarkdown: string;
  summary?: string;
  tags?: string[];
  folderId?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  sourceType?: DocumentSourceType;
  sourceRef?: DocumentSourceRef;
  frontmatterEnabled?: boolean;
}
