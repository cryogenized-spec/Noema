import type { AgentGenerationSettings } from "@/types/agents";
import type { LockboxRecord, ProviderCatalogEntry, ProviderModel } from "@/types/providers";

export type AgentGenerationSettingKey = keyof AgentGenerationSettings;

const supportMap: Record<AgentGenerationSettingKey, (provider: ProviderCatalogEntry, model: ProviderModel) => boolean> = {
  temperature: (provider, model) => provider.supportedSettings.includes("temperature") && model.supportsTemperature,
  top_p: (provider, model) => provider.supportedSettings.includes("topP") && model.supportsTopP,
  top_k: (provider, model) => provider.supportedSettings.includes("topK") && model.supportsTopK,
  presence_penalty: (provider, model) => provider.supportedSettings.includes("presencePenalty") && model.supportsPresencePenalty,
  frequency_penalty: (provider, model) => provider.supportedSettings.includes("frequencyPenalty") && model.supportsFrequencyPenalty,
  seed: (provider, model) => provider.supportedSettings.includes("seed") && model.supportsSeed,
  reasoning_effort: (provider, model) => provider.supportedSettings.includes("reasoningEffort") && model.supportsReasoningEffort,
  max_output_tokens: (provider) => provider.supportedSettings.includes("maxOutputTokens"),
};

export const AGENT_SETTING_LABELS: Record<AgentGenerationSettingKey, string> = {
  temperature: "Temperature",
  top_p: "Top P",
  top_k: "Top K",
  presence_penalty: "Presence penalty",
  frequency_penalty: "Frequency penalty",
  seed: "Seed",
  reasoning_effort: "Reasoning effort",
  max_output_tokens: "Max output tokens",
};

export function getSupportedAgentSettings(provider: ProviderCatalogEntry, model: ProviderModel): AgentGenerationSettingKey[] {
  return (Object.keys(supportMap) as AgentGenerationSettingKey[]).filter((key) => supportMap[key](provider, model));
}

export function sanitizeAgentGenerationSettings(
  input: AgentGenerationSettings,
  provider: ProviderCatalogEntry,
  model: ProviderModel,
): AgentGenerationSettings {
  const supported = new Set(getSupportedAgentSettings(provider, model));
  const next: AgentGenerationSettings = {};

  for (const [key, value] of Object.entries(input) as Array<[AgentGenerationSettingKey, number | undefined]>) {
    if (value === undefined) continue;
    if (supported.has(key)) {
      next[key] = value;
    }
  }

  if (supported.has("temperature") && next.temperature === undefined) {
    next.temperature = model.defaultTemperature ?? 0.8;
  }

  if (supported.has("max_output_tokens") && next.max_output_tokens === undefined) {
    next.max_output_tokens = 1024;
  }

  return next;
}

export function getProviderConfiguration(record: LockboxRecord | undefined) {
  if (!record) {
    return { configured: false, label: "Not configured", detail: "Add API key in Lockbox to run this agent." };
  }

  return {
    configured: true,
    label: "Configured",
    detail: `Lockbox updated ${new Date(record.updatedAt).toLocaleString()}`,
  };
}

const priceText = (price: number | null) => (price === null ? "N/A" : `$${price.toFixed(2)}`);

export function formatModelPricingSummary(model: ProviderModel): string {
  return `Input ${priceText(model.inputPricePer1M)}/1M · Output ${priceText(model.outputPricePer1M)}/1M`;
}
