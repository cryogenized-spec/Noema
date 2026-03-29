import { composeRuntimeSystemPrompt } from "@/lib/runtime/prompt-pipeline";
import type { AgentExecutionBuildResult, AgentExecutionRequest, ProviderExecutionPayload } from "@/lib/runtime/types";
import { getSupportedAgentSettings } from "@/lib/providers/compatibility";

const settingKeyMap: Record<string, string> = {
  top_p: "top_p",
  top_k: "top_k",
  presence_penalty: "presence_penalty",
  frequency_penalty: "frequency_penalty",
  reasoning_effort: "reasoning_effort",
  max_output_tokens: "max_output_tokens",
  temperature: "temperature",
  seed: "seed",
};

export function buildAgentExecutionPayload(request: AgentExecutionRequest): AgentExecutionBuildResult {
  if (!request.prompt.trim()) {
    return { ok: false, code: "PROVIDER_REQUEST_FAILED", message: "Prompt is required." };
  }

  if (request.model.modelId !== request.agent.modelId) {
    return {
      ok: false,
      code: "UNSUPPORTED_MODEL",
      message: "Selected agent model does not match requested model metadata.",
    };
  }

  const supported = new Set(getSupportedAgentSettings(request.provider, request.model));
  const unsupportedKeys = Object.keys(request.agent.generationSettings).filter((key) => !supported.has(key as keyof typeof request.agent.generationSettings));

  if (unsupportedKeys.length > 0) {
    return {
      ok: false,
      code: "UNSUPPORTED_CONTROLS",
      message: "Agent contains generation controls unsupported by this provider/model.",
      detail: unsupportedKeys.join(", "),
    };
  }

  const generationSettings: Record<string, number> = {};
  for (const [key, value] of Object.entries(request.agent.generationSettings)) {
    if (value === undefined || value === null) continue;
    const mapped = settingKeyMap[key];
    if (!mapped) continue;
    generationSettings[mapped] = value;
  }

  const payload: ProviderExecutionPayload = {
    providerId: request.provider.id,
    modelId: request.model.modelId,
    mode: request.mode,
    streamingMode: request.streamingMode ?? request.agent.streamingMode,
    systemPrompt: composeRuntimeSystemPrompt(request.agent, request.mode),
    prompt: request.prompt,
    conversation: request.conversation ?? [],
    generationSettings,
    apiKey: request.providerApiKey,
    baseUrl: request.providerConfig?.baseUrl,
  };

  if (!request.providerConfig) {
    return {
      ok: false,
      code: "MISSING_PROVIDER_CONFIG",
      message: "Provider is not configured in API Lockbox.",
      detail: `Provider ${request.provider.id} requires lockbox configuration before invocation.`,
    };
  }

  if (!request.providerApiKey?.trim()) {
    return {
      ok: false,
      code: "MISSING_API_KEY",
      message: "Provider API key is missing.",
      detail: `Provider ${request.provider.id} has no API key in lockbox.`,
    };
  }

  return { ok: true, payload };
}
