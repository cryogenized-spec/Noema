import type { AgentProfile } from "@/types/agents";
import type { LockboxRecord, ProviderCatalogEntry, ProviderModel } from "@/types/providers";

export type AgentInvocationMode =
  | "direct_chat"
  | "long_press_ask"
  | "summarize_message"
  | "rewrite_message"
  | "explain_message";

export type AgentRuntimeStreamingMode = "stream" | "chunked" | "oneshot";

export interface RuntimeConversationTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AgentExecutionRequest {
  mode: AgentInvocationMode;
  agent: AgentProfile;
  provider: ProviderCatalogEntry;
  model: ProviderModel;
  providerConfig?: LockboxRecord;
  providerApiKey?: string;
  prompt: string;
  conversation?: RuntimeConversationTurn[];
  streamingMode?: AgentRuntimeStreamingMode;
}

export interface ProviderExecutionPayload {
  providerId: string;
  modelId: string;
  mode: AgentInvocationMode;
  streamingMode: AgentRuntimeStreamingMode;
  systemPrompt: string;
  prompt: string;
  conversation: RuntimeConversationTurn[];
  generationSettings: Record<string, number>;
  apiKey?: string;
  baseUrl?: string;
}

export type AgentRuntimeErrorCode =
  | "MISSING_PROVIDER_CONFIG"
  | "MISSING_API_KEY"
  | "UNSUPPORTED_MODEL"
  | "UNSUPPORTED_CONTROLS"
  | "PROVIDER_REQUEST_FAILED";

export interface AgentRuntimeError {
  ok: false;
  code: AgentRuntimeErrorCode;
  message: string;
  detail?: string;
}

export interface AgentExecutionSuccess {
  ok: true;
  payload: ProviderExecutionPayload;
}

export type AgentExecutionBuildResult = AgentExecutionSuccess | AgentRuntimeError;

export interface AgentExecutionResult {
  ok: boolean;
  provider: string;
  content?: string;
  error?: AgentRuntimeError;
}
