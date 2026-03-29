import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import type { AgentFontFamily, AgentProfile } from "@/types/agents";

export const AGENT_FONT_OPTIONS: Array<{ id: AgentFontFamily; label: string; className: string }> = [
  { id: "inter", label: "Inter", className: "font-agent-inter" },
  { id: "manrope", label: "Manrope", className: "font-agent-manrope" },
  { id: "ibm_plex_sans", label: "IBM Plex Sans", className: "font-agent-ibm" },
  { id: "space_grotesk", label: "Space Grotesk", className: "font-agent-space" },
  { id: "merriweather", label: "Merriweather", className: "font-agent-merriweather" },
  { id: "jetbrains_mono", label: "JetBrains Mono", className: "font-agent-jetbrains" },
];

export const AGENT_COLOR_SWATCHES = [
  "#8B5CF6",
  "#3B82F6",
  "#14B8A6",
  "#F59E0B",
  "#EF4444",
  "#22C55E",
  "#EC4899",
  "#A3E635",
];

export const FONT_COLOR_SWATCHES = ["#F8FAFC", "#E2E8F0", "#CBD5E1", "#FDE68A", "#BFDBFE", "#FBCFE8", "#DCFCE7"];

export const ROLEPLAY_LEVEL_LABELS = [
  "Off",
  "Light flavor",
  "Characterful",
  "Strong roleplay",
  "Immersive",
  "Full simulation",
] as const;

export const STREAMING_MODE_OPTIONS = [
  { id: "stream", label: "Stream" },
  { id: "chunked", label: "Chunked" },
  { id: "oneshot", label: "One-shot" },
] as const;

export function createDefaultAgentProfile(): AgentProfile {
  const provider = PROVIDER_CATALOG[0];
  const model = provider.models[0];
  const now = new Date().toISOString();

  return {
    name: "New Agent",
    description: "",
    avatarImage: "",
    avatarShape: "circle",
    accentColor: "#8B5CF6",
    fontFamily: "inter",
    fontColor: "#F8FAFC",
    providerId: provider.id,
    modelId: model.modelId,
    streamingMode: "stream",
    generationSettings: { temperature: model.defaultTemperature ?? 0.8 },
    baseSystemPrompt: "You are a helpful assistant.",
    characterDefinition: "",
    speechStyle: "Clear, calm, and practical.",
    roleplayIntensity: 0,
    roleplayModeEnabled: false,
    userAppearanceNotes: "",
    relationshipToUser: "",
    sceneOrSetting: "",
    memoryHooks: "",
    safetyBoundaries: "",
    createdAt: now,
    updatedAt: now,
  };
}
