import type { AgentProvider } from "@/lib/ai/types";
import type { ProviderExecutionPayload } from "@/lib/runtime/types";

const normalize = (input: string) => input.trim().replace(/\s+/g, " ").slice(0, 320);

const buildActionHeader = (mode: ProviderExecutionPayload["mode"]) => {
  switch (mode) {
    case "summarize_message":
      return "Here is a concise summary of your selected message.";
    case "rewrite_message":
      return "Here is a rewritten version with improved clarity.";
    case "explain_message":
      return "Here is a clear explanation of the selected message.";
    case "long_press_ask":
      return "I reviewed your selected message and drafted a practical next step.";
    default:
      return "Here is a direct response using your active agent profile.";
  }
};

const buildResponse = (payload: ProviderExecutionPayload): string => {
  const summary = normalize(payload.prompt) || "No message content was provided.";

  return [
    buildActionHeader(payload.mode),
    "",
    `**Summary:** ${summary}`,
    "",
    `**Mode:** ${payload.mode} · **Streaming:** ${payload.streamingMode}`,
    "",
    "If you want, I can turn this into a structured task list.",
  ].join("\n");
};

export const mockProvider: AgentProvider = {
  name: "mock",
  async generateResponse(payload: ProviderExecutionPayload): Promise<string> {
    return buildResponse(payload);
  },
};
