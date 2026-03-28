import type { AgentProvider } from "@/lib/ai/types";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { openAIProvider } from "@/lib/ai/providers/openai-provider";

const providers: Record<string, AgentProvider> = {
  mock: mockProvider,
  openai: openAIProvider,
};

export const resolveProvider = (): AgentProvider => {
  const configuredProvider = process.env.AGENT_PROVIDER?.toLowerCase() ?? "mock";
  const provider = providers[configuredProvider] ?? mockProvider;

  if (provider.name === "openai" && !process.env.OPENAI_API_KEY) {
    return mockProvider;
  }

  return provider;
};
