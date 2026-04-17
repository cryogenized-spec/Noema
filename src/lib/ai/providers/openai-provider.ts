import type { AgentProvider } from "@/lib/ai/types";
import type { ProviderExecutionPayload } from "@/lib/runtime/types";

export const openAIProvider: AgentProvider = {
  name: "openai",
  async generateResponse(payload: ProviderExecutionPayload): Promise<string> {
    const apiKey = payload.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const baseUrl = (payload.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: payload.modelId || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: payload.systemPrompt,
          },
          ...payload.conversation,
          {
            role: "user",
            content: payload.prompt,
          },
        ],
        ...payload.generationSettings,
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
