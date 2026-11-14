import type { AgentProvider } from "@/lib/ai/types";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { openAIProvider } from "@/lib/ai/providers/openai-provider";
const providers: Record<string, AgentProvider> = { openai: openAIProvider, mock: mockProvider };
export const resolveProvider = (id?: string): AgentProvider => {
  const selected = (id ?? process.env.AGENT_PROVIDER ?? "openai").toLowerCase();
  const provider = providers[selected];
  if (!provider) throw new Error("Unavailable provider: " + selected);
  // Never silently substitute fake mock output for an unavailable live model.
  return provider;
};
export const hasProviderAdapter = (id: string) => Boolean(providers[id.toLowerCase()]);
