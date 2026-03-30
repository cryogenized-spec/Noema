export type DocumentAttachmentType = "image" | "file" | "audio" | "video" | "other";

export interface DocumentAttachmentRecord {
  id?: number;
  documentId: number;
  type: DocumentAttachmentType;
  fileName: string;
  mimeType: string;
  localRef: string;
  createdAt: string;
}
