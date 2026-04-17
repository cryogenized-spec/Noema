export type ProviderId =
  | "openai"
  | "gemini"
  | "anthropic"
  | "xai"
  | "deepseek"
  | "moonshot"
  | "qwen"
  | "mistral";

export type ModelCategory =
  | "flagship"
  | "balanced"
  | "fast"
  | "mini"
  | "nano"
  | "reasoning"
  | "coding";

export type SettingKey =
  | "temperature"
  | "topP"
  | "topK"
  | "presencePenalty"
  | "frequencyPenalty"
  | "seed"
  | "reasoningEffort"
  | "maxOutputTokens";

export type GeminiSafetyLevel = "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_ABOVE" | "BLOCK_LOW_AND_ABOVE";

export type GeminiSafetyCategory =
  | "harassment"
  | "hateSpeech"
  | "sexuallyExplicit"
  | "dangerousContent";

export interface GeminiSafetySettings {
  harassment: GeminiSafetyLevel;
  hateSpeech: GeminiSafetyLevel;
  sexuallyExplicit: GeminiSafetyLevel;
  dangerousContent: GeminiSafetyLevel;
}

export interface ProviderModel {
  modelId: string;
  displayName: string;
  category: ModelCategory;
  inputPricePer1M: number | null;
  outputPricePer1M: number | null;
  currency: "USD";
  contextWindow: number | null;
  supportsTemperature: boolean;
  supportsTopP: boolean;
  supportsTopK: boolean;
  supportsPresencePenalty: boolean;
  supportsFrequencyPenalty: boolean;
  supportsSeed: boolean;
  supportsReasoningEffort: boolean;
  defaultTemperature: number | null;
  notes: string;
}

export interface ProviderCatalogEntry {
  id: ProviderId;
  displayName: string;
  docsUrl: string;
  baseUrl: string;
  logoPath: string;
  keyPlaceholder: string;
  models: ProviderModel[];
  supportedSettings: SettingKey[];
  lastVerified: string;
  notes: string;
}

export type ProviderGenerationSettings = Partial<Record<SettingKey, number | string>>;

export interface LockboxRecord {
  providerId: ProviderId;
  apiKeyEncrypted: string;
  baseUrl: string;
  defaultModelId: string;
  settings: ProviderGenerationSettings;
  geminiSafety?: GeminiSafetySettings;
  updatedAt: string;
}
