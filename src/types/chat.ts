import type { ProviderExecutionPayload } from "@/lib/runtime/types";

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessageMetadata {
  provider?: string;
  providerId?: string;
  modelId?: string;
  invocationMode?: string;
  agentId?: number;
  agentName?: string;
  streamingMode?: string;
  outputVisibility?: "public" | "ghost";
  targetMessageId?: number;
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
  role: MessageRole;
  content: string;
  createdAt: string;
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
