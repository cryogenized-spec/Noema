import type { AgentContext } from "@/types/chat";

export interface AgentProvider {
  name: string;
  generateResponse: (prompt: string, context?: AgentContext) => Promise<string>;
}
