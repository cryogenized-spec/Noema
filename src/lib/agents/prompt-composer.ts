import { ROLEPLAY_LEVEL_LABELS } from "@/lib/agents/defaults";
import type { PromptCompositionInput } from "@/types/agents";

const appendSection = (sections: string[], title: string, value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return;
  sections.push(`## ${title}\n${trimmed}`);
};

export function composeAgentSystemPrompt(input: PromptCompositionInput): string {
  const sections: string[] = [];

  appendSection(sections, "Base instructions", input.baseSystemPrompt);
  appendSection(sections, "Character definition", input.characterDefinition);
  appendSection(sections, "Speech style", input.speechStyle);

  if (input.roleplayModeEnabled && input.roleplayIntensity > 0) {
    sections.push(
      `## Roleplay mode\nEnabled at level ${input.roleplayIntensity} (${ROLEPLAY_LEVEL_LABELS[input.roleplayIntensity] ?? "Custom"}). Keep it playful but preserve user safety and factual integrity.`,
    );
  }

  appendSection(sections, "User appearance", input.userAppearanceNotes);
  appendSection(sections, "Relationship", input.relationshipToUser);
  appendSection(sections, "Scene / setting", input.sceneOrSetting);
  appendSection(sections, "Memory hooks", input.memoryHooks);
  appendSection(sections, "Safety boundaries", input.safetyBoundaries);

  return sections.join("\n\n").trim();
}

export function createAgentPreviewReply(input: PromptCompositionInput, agentName: string): string {
  const roleplayLabel = input.roleplayModeEnabled
    ? ROLEPLAY_LEVEL_LABELS[input.roleplayIntensity] ?? "Custom"
    : "Off";

  return [
    `${agentName}: Great to meet you.`,
    `Style: ${input.speechStyle || "Clear and practical"}.`,
    `Roleplay: ${roleplayLabel}.`,
    input.sceneOrSetting ? `Setting: ${input.sceneOrSetting}.` : null,
    input.relationshipToUser ? `Relationship: ${input.relationshipToUser}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
