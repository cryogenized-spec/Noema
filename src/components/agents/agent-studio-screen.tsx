"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import { useAgentStore } from "@/store/agent-store";
import { useLockboxStore } from "@/store/lockbox-store";
import {
  AGENT_COLOR_SWATCHES,
  AGENT_FONT_OPTIONS,
  FONT_COLOR_SWATCHES,
  ROLEPLAY_LEVEL_LABELS,
  STREAMING_MODE_OPTIONS,
  createDefaultAgentProfile,
} from "@/lib/agents/defaults";
import { composeAgentSystemPrompt, createAgentPreviewReply } from "@/lib/agents/prompt-composer";
import { getSupportedAgentSettings, sanitizeAgentGenerationSettings, settingLabels, type AgentGenerationSettingKey } from "@/lib/agents/generation";
import { formatModelPricingSummary, getProviderConfiguration } from "@/lib/providers/compatibility";
import type { AgentAvatarShape, AgentProfile } from "@/types/agents";

const shapeOptions: AgentAvatarShape[] = ["square", "circle", "portrait"];

const settingBounds: Record<AgentGenerationSettingKey, { min: number; max: number; step: number }> = {
  temperature: { min: 0, max: 2, step: 0.1 },
  top_p: { min: 0, max: 1, step: 0.05 },
  top_k: { min: 1, max: 100, step: 1 },
  presence_penalty: { min: -2, max: 2, step: 0.1 },
  frequency_penalty: { min: -2, max: 2, step: 0.1 },
  seed: { min: 1, max: 9999, step: 1 },
  reasoning_effort: { min: 0, max: 10, step: 1 },
  max_output_tokens: { min: 64, max: 8192, step: 32 },
};

export function AgentStudioScreen() {
  const { agents, hydrateAgents, hydrated, hydrating, createAgent, updateAgent, duplicateAgent, deleteAgent } = useAgentStore();
  const { records, hydrate } = useLockboxStore();

  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null);
  const [advancedAccent, setAdvancedAccent] = useState(false);
  const [advancedFontColor, setAdvancedFontColor] = useState(false);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateAgents();
    }
  }, [hydrateAgents, hydrated, hydrating]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const lockboxByProvider = useMemo(() => new Map(records.map((item) => [item.providerId, item])), [records]);

  const selectedProvider = useMemo(
    () => PROVIDER_CATALOG.find((provider) => provider.id === (editingAgent?.providerId ?? PROVIDER_CATALOG[0].id)) ?? PROVIDER_CATALOG[0],
    [editingAgent?.providerId],
  );

  const selectedModel = useMemo(() => {
    const model = selectedProvider.models.find((candidate) => candidate.modelId === editingAgent?.modelId);
    return model ?? selectedProvider.models[0];
  }, [editingAgent?.modelId, selectedProvider]);

  const providerConfig = useMemo(
    () => getProviderConfiguration(lockboxByProvider.get(selectedProvider.id)),
    [lockboxByProvider, selectedProvider.id],
  );

  const supportedSettings = useMemo(
    () => getSupportedAgentSettings(selectedProvider, selectedModel),
    [selectedProvider, selectedModel],
  );

  const previewPrompt = useMemo(() => {
    if (!editingAgent) return "";
    return composeAgentSystemPrompt(editingAgent);
  }, [editingAgent]);

  const previewReply = useMemo(() => {
    if (!editingAgent) return "";
    return createAgentPreviewReply(editingAgent, editingAgent.name || "Agent");
  }, [editingAgent]);

  const selectedFont = AGENT_FONT_OPTIONS.find((option) => option.id === editingAgent?.fontFamily) ?? AGENT_FONT_OPTIONS[0];

  const applyDraft = (patch: Partial<AgentProfile>) => {
    setEditingAgent((current) => (current ? { ...current, ...patch } : current));
  };

  const updateGenerationSetting = (key: AgentGenerationSettingKey, value: number) => {
    setEditingAgent((current) => {
      if (!current) return current;
      const candidate = { ...current.generationSettings, [key]: value };
      return { ...current, generationSettings: sanitizeAgentGenerationSettings(candidate, selectedProvider, selectedModel) };
    });
  };

  const saveAgent = async () => {
    if (!editingAgent) return;

    const cleaned = {
      ...editingAgent,
      generationSettings: sanitizeAgentGenerationSettings(editingAgent.generationSettings, selectedProvider, selectedModel),
    };

    if (!cleaned.id) {
      const created = await createAgent(cleaned);
      setEditingAgent(created);
      return;
    }

    await updateAgent(cleaned.id, cleaned);
  };

  if (editingAgent) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-3">
        <header className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-200"
            onClick={() => setEditingAgent(null)}
          >
            Back
          </button>
          <p className="text-sm font-semibold text-slate-100">Agent Editor</p>
          <button
            type="button"
            className="rounded-lg bg-violet-500 px-2 py-1 text-xs font-semibold text-white"
            onClick={() => void saveAgent()}
          >
            Save
          </button>
        </header>

        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-slate-900/45 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</h3>
          <input value={editingAgent.name} onChange={(event) => applyDraft({ name: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Agent name" />
          <input value={editingAgent.description ?? ""} onChange={(event) => applyDraft({ description: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Short description" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-300">Avatar image</label>
            <input
              type="file"
              accept="image/*"
              className="text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  applyDraft({ avatarImage: String(reader.result ?? "") });
                };
                reader.readAsDataURL(file);
              }}
            />
          </div>
          <div className="flex gap-2">
            {shapeOptions.map((shape) => (
              <button key={shape} type="button" onClick={() => applyDraft({ avatarShape: shape })} className={`rounded-lg border px-2 py-1 text-xs ${editingAgent.avatarShape === shape ? "border-violet-300 bg-violet-500/20" : "border-noema-borderSoft"}`}>
                {shape}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Accent color</p>
          <div className="flex flex-wrap gap-2">
            {AGENT_COLOR_SWATCHES.map((color) => (
              <button key={color} type="button" onClick={() => applyDraft({ accentColor: color })} className={`h-7 w-7 rounded-full border ${editingAgent.accentColor === color ? "border-white" : "border-transparent"}`} style={{ backgroundColor: color }} />
            ))}
          </div>
          <button type="button" className="text-xs text-violet-300" onClick={() => setAdvancedAccent((current) => !current)}>{advancedAccent ? "Hide advanced" : "Advanced color"}</button>
          {advancedAccent && (
            <div className="flex gap-2">
              <input type="color" value={editingAgent.accentColor} onChange={(event) => applyDraft({ accentColor: event.target.value })} className="h-9 w-12 rounded" />
              <input value={editingAgent.accentColor} onChange={(event) => applyDraft({ accentColor: event.target.value })} className="flex-1 rounded-lg border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs" />
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-slate-900/45 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Typography</h3>
          <select value={editingAgent.fontFamily} onChange={(event) => applyDraft({ fontFamily: event.target.value as AgentProfile["fontFamily"] })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-2 py-2 text-sm">
            {AGENT_FONT_OPTIONS.map((font) => (
              <option key={font.id} value={font.id}>{font.label}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {FONT_COLOR_SWATCHES.map((color) => (
              <button key={color} type="button" onClick={() => applyDraft({ fontColor: color })} className={`h-7 w-7 rounded-full border ${editingAgent.fontColor === color ? "border-white" : "border-transparent"}`} style={{ backgroundColor: color }} />
            ))}
          </div>
          <button type="button" className="text-xs text-violet-300" onClick={() => setAdvancedFontColor((current) => !current)}>{advancedFontColor ? "Hide advanced" : "Advanced font color"}</button>
          {advancedFontColor && (
            <div className="flex gap-2">
              <input type="color" value={editingAgent.fontColor} onChange={(event) => applyDraft({ fontColor: event.target.value })} className="h-9 w-12 rounded" />
              <input value={editingAgent.fontColor} onChange={(event) => applyDraft({ fontColor: event.target.value })} className="flex-1 rounded-lg border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs" />
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-slate-900/45 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Model</h3>
          <select
            value={editingAgent.providerId}
            onChange={(event) => {
              const provider = PROVIDER_CATALOG.find((item) => item.id === event.target.value) ?? PROVIDER_CATALOG[0];
              applyDraft({
                providerId: provider.id,
                modelId: provider.models[0].modelId,
                generationSettings: sanitizeAgentGenerationSettings(editingAgent.generationSettings, provider, provider.models[0]),
              });
            }}
            className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-2 py-2 text-sm"
          >
            {PROVIDER_CATALOG.map((provider) => {
              const configured = lockboxByProvider.has(provider.id);
              return (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName} {configured ? "(Configured)" : "(Not configured)"}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-slate-400">
            {providerConfig.label} · {providerConfig.detail}
          </p>
          <select
            value={editingAgent.modelId}
            onChange={(event) => {
              const model = selectedProvider.models.find((item) => item.modelId === event.target.value) ?? selectedProvider.models[0];
              applyDraft({
                modelId: model.modelId,
                generationSettings: sanitizeAgentGenerationSettings(editingAgent.generationSettings, selectedProvider, model),
              });
            }}
            className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-2 py-2 text-sm"
          >
            {selectedProvider.models.map((model) => (
              <option key={model.modelId} value={model.modelId}>{model.displayName}</option>
            ))}
          </select>
          {!providerConfig.configured && (
            <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
              This provider is not configured in Lockbox. Agent profile can be saved, but runtime calls are unavailable.
            </p>
          )}
          <p className="text-xs text-slate-400">Pricing: {formatModelPricingSummary(selectedModel)}</p>
          <p className="text-xs text-slate-400">Supported controls: {supportedSettings.map((key) => settingLabels[key]).join(", ") || "None"}</p>
          <div className="grid grid-cols-3 gap-2">
            {STREAMING_MODE_OPTIONS.map((mode) => (
              <button key={mode.id} type="button" onClick={() => applyDraft({ streamingMode: mode.id })} className={`rounded-lg border px-2 py-1 text-xs ${editingAgent.streamingMode === mode.id ? "border-violet-300 bg-violet-500/20" : "border-noema-borderSoft"}`}>
                {mode.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-slate-900/45 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Behavior</h3>
          <textarea rows={3} value={editingAgent.baseSystemPrompt} onChange={(event) => applyDraft({ baseSystemPrompt: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Base system prompt" />
          <textarea rows={2} value={editingAgent.characterDefinition} onChange={(event) => applyDraft({ characterDefinition: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Character definition" />
          <textarea rows={2} value={editingAgent.speechStyle} onChange={(event) => applyDraft({ speechStyle: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Speech style" />
          <label className="flex items-center justify-between text-xs text-slate-300">
            Roleplay mode
            <input type="checkbox" checked={editingAgent.roleplayModeEnabled} onChange={(event) => applyDraft({ roleplayModeEnabled: event.target.checked })} />
          </label>
          <div>
            <p className="text-xs text-slate-300">Roleplay intensity: {editingAgent.roleplayIntensity} ({ROLEPLAY_LEVEL_LABELS[editingAgent.roleplayIntensity]})</p>
            <input type="range" min={0} max={5} step={1} value={editingAgent.roleplayIntensity} onChange={(event) => applyDraft({ roleplayIntensity: Number(event.target.value) })} className="w-full" />
          </div>
          <textarea rows={2} value={editingAgent.userAppearanceNotes} onChange={(event) => applyDraft({ userAppearanceNotes: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="User appearance notes" />
          <textarea rows={2} value={editingAgent.relationshipToUser} onChange={(event) => applyDraft({ relationshipToUser: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Relationship to user" />
          <textarea rows={2} value={editingAgent.sceneOrSetting} onChange={(event) => applyDraft({ sceneOrSetting: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Scene or setting" />
          <textarea rows={2} value={editingAgent.memoryHooks ?? ""} onChange={(event) => applyDraft({ memoryHooks: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Memory hooks" />
          <textarea rows={2} value={editingAgent.safetyBoundaries ?? ""} onChange={(event) => applyDraft({ safetyBoundaries: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm" placeholder="Safety boundaries" />
        </section>

        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-slate-900/45 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Generation settings</h3>
          {supportedSettings.map((key) => {
            const bounds = settingBounds[key];
            const value = editingAgent.generationSettings[key] ?? bounds.min;
            return (
              <label key={key} className="block text-xs text-slate-300">
                <div className="mb-1 flex justify-between">
                  <span>{settingLabels[key]}</span>
                  <span>{value}</span>
                </div>
                <input type="range" min={bounds.min} max={bounds.max} step={bounds.step} value={value} onChange={(event) => updateGenerationSetting(key, Number(event.target.value))} className="w-full" />
              </label>
            );
          })}
        </section>

        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-slate-900/45 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</h3>
          <div className="rounded-xl border border-noema-borderSoft bg-slate-950/80 p-3" style={{ borderColor: editingAgent.accentColor }}>
            <div className="mb-2 flex items-center gap-2">
              <div
                className={`overflow-hidden border border-noema-borderSoft bg-slate-800 ${editingAgent.avatarShape === "circle" ? "h-10 w-10 rounded-full" : editingAgent.avatarShape === "portrait" ? "h-12 w-9 rounded-lg" : "h-10 w-10 rounded-lg"}`}
              >
                {editingAgent.avatarImage ? <Image src={editingAgent.avatarImage} alt="Agent avatar" width={96} height={96} className="h-full w-full object-cover" unoptimized /> : <div className="flex h-full items-center justify-center text-xs">AI</div>}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">{editingAgent.name || "Unnamed agent"}</p>
                <p className="text-[11px] text-slate-400">{selectedProvider.displayName} · {selectedModel.displayName}</p>
              </div>
            </div>
            <p className={`${selectedFont.className} text-sm`} style={{ color: editingAgent.fontColor }}>{previewReply}</p>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-slate-300">Preview composed system prompt</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-noema-borderSoft bg-slate-950/80 p-2 text-[11px] text-slate-300">{previewPrompt}</pre>
          </details>
        </section>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Agent Studio</h2>
          <p className="text-xs text-slate-400">Create and style reusable agent profiles.</p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white"
          onClick={async () => {
            const created = await createAgent(createDefaultAgentProfile());
            setEditingAgent(created);
          }}
        >
          New agent
        </button>
      </header>

      <div className="space-y-2">
        {agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-noema-borderSoft bg-slate-900/40 p-4 text-sm text-slate-300">
            No agents yet. Create your first agent profile.
          </div>
        ) : (
          agents.map((agent) => {
            const provider = PROVIDER_CATALOG.find((item) => item.id === agent.providerId);
            const model = provider?.models.find((item) => item.modelId === agent.modelId);
            const font = AGENT_FONT_OPTIONS.find((item) => item.id === agent.fontFamily) ?? AGENT_FONT_OPTIONS[0];

            return (
              <article key={agent.id ?? `${agent.name}-${agent.updatedAt}`} className="rounded-xl border border-noema-borderSoft bg-slate-900/55 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`overflow-hidden border border-noema-borderSoft bg-slate-800 ${agent.avatarShape === "circle" ? "h-10 w-10 rounded-full" : agent.avatarShape === "portrait" ? "h-12 w-9 rounded-lg" : "h-10 w-10 rounded-lg"}`}>
                      {agent.avatarImage ? <Image src={agent.avatarImage} alt="Agent avatar" width={96} height={96} className="h-full w-full object-cover" unoptimized /> : <div className="flex h-full items-center justify-center text-xs">AI</div>}
                    </div>
                    <div>
                      <p className={`${font.className} text-sm font-semibold`} style={{ color: agent.fontColor }}>{agent.name}</p>
                      <p className="text-xs text-slate-400">{agent.description || `${provider?.displayName ?? "Provider"} · ${model?.displayName ?? agent.modelId}`}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="rounded-md border border-noema-borderSoft p-1.5 text-slate-300" onClick={() => setEditingAgent(agent)}>
                      <Icon icon="solar:pen-bold" />
                    </button>
                    <button type="button" className="rounded-md border border-noema-borderSoft p-1.5 text-slate-300" onClick={() => void duplicateAgent(agent.id ?? -1)}>
                      <Icon icon="solar:copy-bold" />
                    </button>
                    <button type="button" className="rounded-md border border-rose-300/25 p-1.5 text-rose-200" onClick={() => void deleteAgent(agent.id ?? -1)}>
                      <Icon icon="solar:trash-bin-trash-bold" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: agent.accentColor }} />
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
