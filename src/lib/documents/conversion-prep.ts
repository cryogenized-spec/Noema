import type { ChatMessage } from "@/types/chat";
import type { CreateDocumentInput } from "@/types/documents";
import { normalizeWikilinks } from "@/lib/notes/conversion";
import { prepareOcrDocumentDraft } from "@/lib/documents/ocr-intake";

const truncate = (value: string, max = 72) => (value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`);

export function prepareDocumentFromSingleMessage(message: ChatMessage): CreateDocumentInput {
  return {
    title: truncate(message.content.replace(/\s+/g, " ")) || "Chat Document",
    bodyMarkdown: normalizeWikilinks(message.content),
    tags: ["noema", "chat", message.role],
    sourceType: "chat_conversion",
    sourceRef: {
      chatMessageIds: message.id !== undefined ? [message.id] : [],
    },
  };
}

export function prepareDocumentFromMessageSelection(messages: ChatMessage[], title = "Chat Selection Document"): CreateDocumentInput {
  const bodyMarkdown = messages
    .map((message, index) => `## ${index + 1}. ${message.role.toUpperCase()}\n\n${normalizeWikilinks(message.content)}`)
    .join("\n\n");

  return {
    title,
    bodyMarkdown,
    tags: ["noema", "chat", "selection"],
    sourceType: "chat_conversion",
    sourceRef: {
      chatMessageIds: messages.flatMap((message) => (message.id !== undefined ? [message.id] : [])),
    },
  };
}

export function prepareDocumentFromOcrText(
  text: string,
  sourceRef?: { ocrJobId?: string; ocrEngine?: string },
): CreateDocumentInput {
  return prepareOcrDocumentDraft(text, {
    titleHint: "OCR Capture",
    sourceRef,
  });
}
