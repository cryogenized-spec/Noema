export type DocumentConversionSource = "chat_single" | "chat_selection" | "ocr_text";

export interface DocumentConversionHook {
  source: DocumentConversionSource;
  label: string;
  ready: boolean;
}

export const DOCUMENT_CONVERSION_HOOKS: DocumentConversionHook[] = [
  { source: "chat_single", label: "Chat message", ready: false },
  { source: "chat_selection", label: "Message selection", ready: false },
  { source: "ocr_text", label: "OCR text", ready: false },
];
