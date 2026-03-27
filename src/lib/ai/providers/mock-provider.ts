import type { AgentProvider } from "@/lib/ai/types";
import type { AgentContext } from "@/types/chat";

const normalize = (input: string) => input.trim().replace(/\s+/g, " ").slice(0, 320);

const buildActionHeader = (context?: AgentContext) => {
  switch (context?.action) {
    case "summarize":
      return "Here is a concise summary of your selected message.";
    case "analyze":
      return "Here is a structured analysis of your selected message.";
    default:
      return "I reviewed your selected message and drafted a practical next step.";
  }
};

const buildResponse = (prompt: string, context?: AgentContext): string => {
  const summary = normalize(prompt) || "No message content was provided.";

  return [
    buildActionHeader(context),
    "",
    `**Summary:** ${summary}`,
    "",
    "```plan",
    "1. Clarify the desired outcome in one sentence.",
    "2. Choose the smallest executable next action (under 10 minutes).",
    "3. Record the result in Organizer after completion.",
    "```",
    "",
    "If you want, I can turn this into a ready-to-check task list.",
  ].join("\n");
};

export const mockProvider: AgentProvider = {
  name: "mock",
  async generateResponse(prompt: string, context?: AgentContext): Promise<string> {
    return buildResponse(prompt, context);
  },
};
