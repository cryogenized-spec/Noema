import type { AgentProvider } from "@/lib/ai/types";
import type { ProviderExecutionPayload } from "@/lib/runtime/types";
import { boundConversation, CONTEXT_LIMITS } from "@/lib/ai/context-budget";
import { extractOpenAIText } from "@/lib/ai/openai-response";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
function requestBody(payload: ProviderExecutionPayload, stream: boolean): Record<string, unknown> {
  const maxOutput = payload.generationSettings.max_output_tokens;
  const outputLimit = typeof maxOutput === "number" && Number.isFinite(maxOutput)
    ? Math.max(128, Math.min(2048, Math.floor(maxOutput))) : 1024;
  const body: Record<string, unknown> = {
    model: payload.modelId,
    instructions: payload.systemPrompt.slice(0, CONTEXT_LIMITS.maxSystemChars),
    input: [
      ...boundConversation(payload.conversation),
      { role: "user", content: payload.prompt.slice(0, CONTEXT_LIMITS.maxPromptChars) },
    ],
    max_output_tokens: outputLimit,
    store: false,
    stream,
    // No tools are enabled until authenticated MCP execution and quotas exist.
    tools: [],
  };
  if (payload.modelId.startsWith("gpt-4.1") && Number.isFinite(payload.generationSettings.temperature)) {
    body.temperature = Math.max(0, Math.min(2, payload.generationSettings.temperature));
  }
  // NOEMA stores reasoning effort as a 0–10 editor slider.
  // Map it to the documented Responses API enum; never forward the raw number.
  const effort = payload.generationSettings.reasoning_effort;
  if (typeof effort === "number" && Number.isFinite(effort) && /^gpt-(?:5|6)/.test(payload.modelId)) {
    const level = effort < 1 ? "low" : effort < 3 ? "low" : effort < 5 ? "medium"
      : effort < 7 ? "high" : effort < 9 ? "xhigh" : "max";
    body.reasoning = { effort: level };
  }
  return body;
}
async function callOpenAI(payload: ProviderExecutionPayload, stream: boolean, signal?: AbortSignal): Promise<Response> {
  if (!payload.apiKey?.trim()) throw new Error("OpenAI BYOK key is missing.");
  if (payload.baseUrl && payload.baseUrl.replace(/\/$/, "") !== "https://api.openai.com/v1") {
    throw new Error("Custom OpenAI API endpoint is disallowed to prevent credential exfiltration.");
  }
  if (!/^gpt-[a-z0-9.-]{1,65}$/i.test(payload.modelId)) throw new Error("Unsupported OpenAI model identifier.");
  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + payload.apiKey },
    body: JSON.stringify(requestBody(payload, stream)),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("OpenAI request failed (HTTP " + response.status + ").");
  return response;
}
export async function openAIStreamResponse(payload: ProviderExecutionPayload, signal?: AbortSignal): Promise<Response> {
  return callOpenAI(payload, true, signal);
}
export const openAIProvider: AgentProvider = {
  name: "openai",
  async generateResponse(payload: ProviderExecutionPayload): Promise<string> {
    const response = await callOpenAI(payload, false);
    return extractOpenAIText(await response.json() as unknown);
  },
};
