import { composeAgentSystemPrompt } from "@/lib/agents/prompt-composer";
import type { AgentInvocationMode } from "@/lib/runtime/types";
import type { AgentProfile } from "@/types/agents";

const modeInstructions: Record<AgentInvocationMode, string> = {
  direct_chat: "Respond as the active assistant for an ongoing chat.",
  long_press_ask: "Focus on the selected message and provide practical next steps.",
  summarize_message: "Summarize the selected message with high signal and low fluff.",
  rewrite_message: "Rewrite the selected message preserving intent and constraints.",
  explain_message: "Explain the selected message clearly and accurately.",
};

export function composeRuntimeSystemPrompt(agent: AgentProfile, mode: AgentInvocationMode): string {
  const base = composeAgentSystemPrompt(agent);
  return [
    base,
    "## Invocation mode",
    `${mode}: ${modeInstructions[mode]}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
