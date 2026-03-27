export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id?: number;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AgentContext {
  action?: "ask_agent" | "summarize" | "analyze";
  sourceMessageId?: number;
}

export interface AgentRequestPayload {
  prompt: string;
  context?: AgentContext;
}

export interface AgentResponsePayload {
  content: string;
  provider: string;
}
