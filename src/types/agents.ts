import type { ProviderId } from "@/types/providers";

export type AgentAvatarShape = "square" | "circle" | "portrait";
export type AgentStreamingMode = "stream" | "chunked" | "oneshot";

export type AgentFontFamily =
  | "inter"
  | "manrope"
  | "ibm_plex_sans"
  | "space_grotesk"
  | "merriweather"
  | "jetbrains_mono";

export interface AgentGenerationSettings {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  reasoning_effort?: number;
  max_output_tokens?: number;
}

export interface AgentProfile {
  id?: number;
  name: string;
  description?: string;
  avatarImage?: string;
  avatarShape: AgentAvatarShape;
  accentColor: string;
  fontFamily: AgentFontFamily;
  fontColor: string;

  providerId: ProviderId;
  modelId: string;
  streamingMode: AgentStreamingMode;
  generationSettings: AgentGenerationSettings;

  baseSystemPrompt: string;
  characterDefinition: string;
  speechStyle: string;
  roleplayIntensity: number;
  roleplayModeEnabled: boolean;
  userAppearanceNotes: string;
  relationshipToUser: string;
  sceneOrSetting: string;
  memoryHooks?: string;
  safetyBoundaries?: string;

  createdAt: string;
  updatedAt: string;
}

export interface PromptCompositionInput {
  baseSystemPrompt: string;
  characterDefinition: string;
  speechStyle: string;
  roleplayModeEnabled: boolean;
  roleplayIntensity: number;
  userAppearanceNotes: string;
  relationshipToUser: string;
  sceneOrSetting: string;
  memoryHooks?: string;
  safetyBoundaries?: string;
}
