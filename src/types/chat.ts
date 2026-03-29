import type { ProviderExecutionPayload } from "@/lib/runtime/types";
import type {
  ConversationMessageAuthor,
  ConversationMessageDelivery,
  ConversationMessageKind,
  MessageInvocationMetadata,
} from "@/types/conversation";

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessageMetadata extends MessageInvocationMetadata {
  provider?: string;
  providerId?: string;
  modelId?: string;
  agentName?: string;
  streamingMode?: string;
  outputVisibility?: "public" | "ghost" | "private_draft";
  agentStyle?: {
    avatarImage?: string;
    avatarShape?: "square" | "circle" | "portrait";
    fontFamilyClass?: string;
    fontColor?: string;
    accentColor?: string;
  };
  [key: string]: string | number | boolean | null | object | undefined;
}

export interface ChatMessage {
  id?: number;
  threadKey: string;
  role: MessageRole;
  kind: ConversationMessageKind;
  content: string;
  createdAt: string;
  author: ConversationMessageAuthor;
  delivery?: ConversationMessageDelivery;
  metadata?: ChatMessageMetadata;
}

export interface AgentContext {
  action?: "ask_agent" | "summarize" | "analyze" | "extract_tasks" | "explain_code";
  sourceMessageId?: number;
}

export interface AgentRequestPayload {
  prompt: string;
  context?: AgentContext;
  executionPayload?: ProviderExecutionPayload;
}

export interface AgentResponsePayload {
  content: string;
  provider: string;
  error?: string | Record<string, unknown>;
}
