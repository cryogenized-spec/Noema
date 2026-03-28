import type { AgentProvider } from "@/lib/ai/types";
import type { AgentContext } from "@/types/chat";

export const openAIProvider: AgentProvider = {
  name: "openai",
  async generateResponse(prompt: string, context?: AgentContext): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You are Noema Agent. Be concise, practical, calm, and action-oriented for power users.",
          },
          {
            role: "user",
            content: `Action: ${context?.action ?? "ask_agent"}\n\nMessage:\n${prompt}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      output_text?: string;
    };

    return json.output_text ?? "I could not generate a response from OpenAI.";
  },
};
