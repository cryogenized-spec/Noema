import type { ProviderExecutionPayload } from "@/lib/runtime/types";

export interface AgentProvider {
  name: string;
  generateResponse: (payload: ProviderExecutionPayload) => Promise<string>;
}
