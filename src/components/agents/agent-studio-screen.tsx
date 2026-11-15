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
import type { AgentAvatarShape, AgentProfile, AgentRole } from "@/types/agents";
import { AGENT_ROLE_DEFINITIONS, normalizeAgentRoles } from "@/lib/agents/role-routing";

const shapeOptions: AgentAvatarShape[] = ["square", "circle", "portrait"];

const settingBounds: Record<AgentGenerationSettingKey, { min: number; max: number; step: number }> = {
  temperature: { min: 0, max: 2, step: 0.1 },
  top_p: { min: 0, max: 1, step: 0.05 },
  top_k: { min: 1, max: 100, step: 1 },
  presence_penalty: { min: -2, max: 2, step: 0.1 },
  frequency_penalty: { min: -2, max: 2, step: 0.1 },
  seed: { min: 1, max: 9999, step: 1 },
  reasoning_effort: { min: 0, max: 10, step: 1 },
  max_output_tokens: { min: 64, max: 2048, step: 32 },
};

export function AgentStudioScreen() {
  const { agents, hydrateAgents, hydrated, hydrating, createAgent, updateAgent, duplicateAgent, deleteAgent } = useAgentStore();
  const { records, hydrate } = useLockboxStore();

  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null);
  const [editorTab, setEditorTab] = useState<"identity" | "typography" | "model" | "behavior" | "generation" | "preview" | "roles">("identity");
  const [advancedAccent, setAdvancedAccent] = useState(false);
  const [advancedFontColor, setAdvancedFontColor] = useState(false);
  const [imageError, setImageError] = useState("");
  const [saveError, setSaveError] = useState("");

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
    setSaveError("");

    const cleaned = {
      ...editingAgent,
      generationSettings: sanitizeAgentGenerationSettings(editingAgent.generationSettings, selectedProvider, selectedModel),
    };

    try {
      if (!cleaned.id) {
        const created = await createAgent(cleaned);
        setEditingAgent(created);
        return;
      }
      await updateAgent(cleaned.id, cleaned);
    } catch {
      setSaveError("Could not save the agent or its role assignments. Please check browser storage and retry.");
    }
  };

  if (editingAgent) {
    return (
      <section className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-noema-border bg-[#0b0b0d] p-2 sm:p-3">
        <header className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-neutral-200"
            onClick={() => setEditingAgent(null)}
          >
            Back
          </button>
          <p className="text-sm font-semibold text-white">AI Studio <span className="text-neutral-500">/ Editor</span></p>
          <button
            type="button"
            className="rounded-lg bg-noema-lime px-3 py-2 text-xs font-semibold text-black"
            onClick={() => void saveAgent()}
          >
            Save
          </button>
        </header>

        <nav className="grid shrink-0 grid-cols-4 gap-1 rounded-lg border border-noema-border bg-[#111113] p-1 sm:grid-cols-7" aria-label="Agent editor sections">
          {([
            ["identity", "Identity"],
            ["typography", "Fonts"],
            ["model", "Model"],
            ["behavior", "Behavior"],
            ["generation", "Tuning"],
            ["preview", "Preview"],
            ["roles", "Roles"],
          ] as const).map(([id, title]) => (
            <button key={id} type="button" aria-current={editorTab === id ? "page" : undefined}
              className={`min-h-9 rounded-md px-1.5 text-[10px] font-semibold transition sm:text-[11px]
                ${editorTab === id ? "bg-noema-lime text-black" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}
              onClick={() => setEditorTab(id)}>{title}</button>
          ))}
        </nav>
        {saveError && <p role="alert" className="rounded-lg border border-rose-300/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">{saveError}</p>}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
          {editorTab === "identity" && (
        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-noema-lime">Identity & avatar</h3>
          <input value={editingAgent.name} onChange={(event) => applyDraft({ name: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Agent name" />
          <input value={editingAgent.description ?? ""} onChange={(event) => applyDraft({ description: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Short description" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-300">Avatar image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 512_000) {
                  setImageError("Choose a PNG, JPEG or WebP image under 500 KB.");
                  event.currentTarget.value = "";
                  return;
                }
                setImageError("");
                const reader = new FileReader();
                reader.onload = () => applyDraft({ avatarImage: String(reader.result ?? "") });
                reader.readAsDataURL(file);
              }}
            />
          </div>
          {imageError && <p role="alert" className="text-xs text-rose-300">{imageError}</p>}
          <div className="flex gap-2">
            {shapeOptions.map((shape) => (
              <button key={shape} type="button" onClick={() => applyDraft({ avatarShape: shape })} className={`rounded-lg border px-2 py-1 text-xs ${editingAgent.avatarShape === shape ? "border-noema-lime bg-noema-lime/10" : "border-noema-borderSoft"}`}>
                {shape}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-400">Accent color</p>
          <div className="flex flex-wrap gap-2">
            {AGENT_COLOR_SWATCHES.map((color) => (
              <button key={color} type="button" onClick={() => applyDraft({ accentColor: color })} className={`h-7 w-7 rounded-full border ${editingAgent.accentColor === color ? "border-white" : "border-transparent"}`} style={{ backgroundColor: color }} />
            ))}
          </div>
          <button type="button" className="text-xs text-noema-lime" onClick={() => setAdvancedAccent((current) => !current)}>{advancedAccent ? "Hide advanced" : "Advanced color"}</button>
          {advancedAccent && (
            <div className="flex gap-2">
              <input type="color" value={editingAgent.accentColor} onChange={(event) => applyDraft({ accentColor: event.target.value })} className="h-9 w-12 rounded" />
              <input value={editingAgent.accentColor} onChange={(event) => applyDraft({ accentColor: event.target.value })} className="flex-1 rounded-lg border border-noema-borderSoft bg-black/80 px-2 py-1 text-xs" />
            </div>
          )}
        </section>
          )}
          {editorTab === "typography" && (
        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Typography</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Choose an agent font">
            {AGENT_FONT_OPTIONS.map((font) => (
              <button key={font.id} type="button" aria-pressed={editingAgent.fontFamily === font.id}
                onClick={() => applyDraft({ fontFamily: font.id })}
                className={`rounded-lg border px-3 py-2 text-left transition hover:border-noema-lime/60 ${editingAgent.fontFamily === font.id ? "border-noema-lime bg-noema-lime/10" : "border-noema-border bg-black/50"}`}>
                <span className="block text-[11px] text-neutral-400">{font.label}</span>
                <span className={`${font.className} mt-1 block text-lg text-white`}>Aa Bb Cc</span>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-noema-border bg-black p-4" aria-live="polite">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-noema-lime">Live type preview · {selectedFont.label}</p>
            <p className={`${selectedFont.className} text-xl leading-relaxed`} style={{ color: editingAgent.fontColor }}>
              The quick brown fox jumps over the lazy dog.
            </p>
            <p className={`${selectedFont.className} mt-2 text-sm`} style={{ color: editingAgent.fontColor }}>
              ABCDEFGHIJKLMNOPQRSTUVWXYZ · 0123456789 · !?&@
            </p>
            <p className="mt-3 text-[11px] text-neutral-500">Local font preview; missing fonts use the defined system fallback, with no remote font download.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FONT_COLOR_SWATCHES.map((color) => (
              <button key={color} type="button" onClick={() => applyDraft({ fontColor: color })} className={`h-7 w-7 rounded-full border ${editingAgent.fontColor === color ? "border-white" : "border-transparent"}`} style={{ backgroundColor: color }} />
            ))}
          </div>
          <button type="button" className="text-xs text-noema-lime" onClick={() => setAdvancedFontColor((current) => !current)}>{advancedFontColor ? "Hide advanced" : "Advanced font color"}</button>
          {advancedFontColor && (
            <div className="flex gap-2">
              <input type="color" value={editingAgent.fontColor} onChange={(event) => applyDraft({ fontColor: event.target.value })} className="h-9 w-12 rounded" />
              <input value={editingAgent.fontColor} onChange={(event) => applyDraft({ fontColor: event.target.value })} className="flex-1 rounded-lg border border-noema-borderSoft bg-black/80 px-2 py-1 text-xs" />
            </div>
          )}
        </section>
          )}
          {editorTab === "model" && (
        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Model</h3>
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
            className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-2 py-2 text-sm"
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
          <p className="text-xs text-neutral-400">
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
            className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-2 py-2 text-sm"
          >
            {selectedProvider.models.map((model) => (
              <option key={model.modelId} value={model.modelId}>{model.displayName}{model.lifecycle && model.lifecycle !== "current" ? ` · ${model.lifecycle}` : ""}</option>
            ))}
          </select>
          {!providerConfig.configured && (
            <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
              This provider is not configured in Lockbox. Agent profile can be saved, but runtime calls are unavailable.
            </p>
          )}
          <p className="text-xs text-neutral-400">Reference pricing: {formatModelPricingSummary(selectedModel)} · Standard text tokens per 1M USD</p>
          <p className="text-xs text-neutral-500">Model status: {selectedModel.lifecycle ?? "unclassified"} · {selectedModel.notes}</p>
          {selectedModel.modelDocsUrl && <a className="text-xs text-noema-lime underline underline-offset-2" href={selectedModel.modelDocsUrl} target="_blank" rel="noopener noreferrer">Official model details</a>}
          <p className="text-[11px] text-neutral-500">The catalogue is not a live account-access check. Your API key, tier, and endpoint determine actual availability.</p>
          <p className="text-xs text-neutral-400">Supported controls: {supportedSettings.map((key) => settingLabels[key]).join(", ") || "None"}</p>
          <div className="grid grid-cols-3 gap-2">
            {STREAMING_MODE_OPTIONS.map((mode) => (
              <button key={mode.id} type="button" onClick={() => applyDraft({ streamingMode: mode.id })} className={`rounded-lg border px-2 py-1 text-xs ${editingAgent.streamingMode === mode.id ? "border-noema-lime bg-noema-lime/10" : "border-noema-borderSoft"}`}>
                {mode.label}
              </button>
            ))}
          </div>
        </section>
          )}
          {editorTab === "behavior" && (
        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Behavior</h3>
          <textarea rows={3} value={editingAgent.baseSystemPrompt} onChange={(event) => applyDraft({ baseSystemPrompt: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Base system prompt" />
          <textarea rows={2} value={editingAgent.characterDefinition} onChange={(event) => applyDraft({ characterDefinition: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Character definition" />
          <textarea rows={2} value={editingAgent.speechStyle} onChange={(event) => applyDraft({ speechStyle: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Speech style" />
          <label className="flex items-center justify-between text-xs text-neutral-300">
            Roleplay mode
            <input type="checkbox" checked={editingAgent.roleplayModeEnabled} onChange={(event) => applyDraft({ roleplayModeEnabled: event.target.checked })} />
          </label>
          <div>
            <p className="text-xs text-neutral-300">Roleplay intensity: {editingAgent.roleplayIntensity} ({ROLEPLAY_LEVEL_LABELS[editingAgent.roleplayIntensity]})</p>
            <input type="range" min={0} max={5} step={1} value={editingAgent.roleplayIntensity} onChange={(event) => applyDraft({ roleplayIntensity: Number(event.target.value) })} className="w-full" />
          </div>
          <textarea rows={2} value={editingAgent.userAppearanceNotes} onChange={(event) => applyDraft({ userAppearanceNotes: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="User appearance notes" />
          <textarea rows={2} value={editingAgent.relationshipToUser} onChange={(event) => applyDraft({ relationshipToUser: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Relationship to user" />
          <textarea rows={2} value={editingAgent.sceneOrSetting} onChange={(event) => applyDraft({ sceneOrSetting: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Scene or setting" />
          <textarea rows={2} value={editingAgent.memoryHooks ?? ""} onChange={(event) => applyDraft({ memoryHooks: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Memory hooks" />
          <textarea rows={2} value={editingAgent.safetyBoundaries ?? ""} onChange={(event) => applyDraft({ safetyBoundaries: event.target.value })} className="w-full rounded-lg border border-noema-borderSoft bg-black/80 px-3 py-2 text-sm" placeholder="Safety boundaries" />
        </section>
          )}
          {editorTab === "generation" && (
        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Generation settings</h3>
          {supportedSettings.map((key) => {
            const bounds = settingBounds[key];
            const value = editingAgent.generationSettings[key] ?? bounds.min;
            return (
              <label key={key} className="block text-xs text-neutral-300">
                <div className="mb-1 flex justify-between">
                  <span>{settingLabels[key]}</span>
                  <span>{value}</span>
                </div>
                <input type="range" min={bounds.min} max={bounds.max} step={bounds.step} value={value} onChange={(event) => updateGenerationSetting(key, Number(event.target.value))} className="w-full" />
              </label>
            );
          })}
        </section>
          )}
          {editorTab === "preview" && (
        <section className="space-y-2 rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Preview</h3>
          <div className="rounded-xl border border-noema-borderSoft bg-black/80 p-3" style={{ borderColor: editingAgent.accentColor }}>
            <div className="mb-2 flex items-center gap-2">
              <div
                className={`overflow-hidden border border-noema-borderSoft bg-[#18181b] ${editingAgent.avatarShape === "circle" ? "h-10 w-10 rounded-full" : editingAgent.avatarShape === "portrait" ? "h-12 w-9 rounded-lg" : "h-10 w-10 rounded-lg"}`}
              >
                {editingAgent.avatarImage ? <Image src={editingAgent.avatarImage} alt="Agent avatar" width={96} height={96} className="h-full w-full object-cover" unoptimized /> : <div className="flex h-full items-center justify-center text-xs">AI</div>}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{editingAgent.name || "Unnamed agent"}</p>
                <p className="text-[11px] text-neutral-400">{selectedProvider.displayName} · {selectedModel.displayName}</p>
              </div>
            </div>
            <p className={`${selectedFont.className} text-sm`} style={{ color: editingAgent.fontColor }}>{previewReply}</p>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-neutral-300">Preview composed system prompt</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-noema-borderSoft bg-black/80 p-2 text-[11px] text-neutral-300">{previewPrompt}</pre>
          </details>
        </section>
          )}
          {editorTab === "roles" && (
            <section className="space-y-3 rounded-xl border border-noema-border bg-[#111113] p-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-noema-lime">Agent responsibilities</h3>
                <p className="mt-2 text-xs leading-5 text-neutral-400">
                  Adapted from the six colour pins in Project RADIX. One agent owns each responsibility. An agent may hold several.
                  Assignments are saved locally; no incoming guest traffic or automation is currently activated.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {AGENT_ROLE_DEFINITIONS.map((role) => {
                  const assigned = normalizeAgentRoles(editingAgent.roleAssignments).includes(role.id);
                  const otherOwner = agents.find((agent) => agent.id !== editingAgent.id
                    && normalizeAgentRoles(agent.roleAssignments).includes(role.id));
                  return (
                    <button key={role.id} type="button" aria-pressed={assigned}
                      onClick={() => {
                        const selected = normalizeAgentRoles(editingAgent.roleAssignments);
                        const next: AgentRole[] = assigned
                          ? selected.filter((entry) => entry !== role.id)
                          : [...selected, role.id];
                        applyDraft({ roleAssignments: next });
                      }}
                      className={`rounded-lg border p-3 text-left transition hover:bg-white/[0.04]
                        ${assigned ? "bg-white/[0.05]" : "border-noema-border bg-black/40"}`}
                      style={assigned ? { borderColor: role.color } : undefined}>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                        <strong className="flex-1 text-sm text-white">{role.label}</strong>
                        <span className="text-[11px] text-noema-lime">{assigned ? "Assigned" : "Assign"}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-neutral-400">{role.description}</p>
                      {otherOwner && <p className="mt-2 text-[11px] text-noema-gold">
                        Currently: {otherOwner.name}. Saving this assignment will transfer the role.
                      </p>}
                    </button>
                  );
                })}
              </div>
              <label className="block text-xs text-neutral-300">
                Planned guest visibility
                <select value={editingAgent.guestVisibility ?? "private"}
                  onChange={(event) => applyDraft({ guestVisibility: event.target.value === "invited" ? "invited" : "private" })}
                  className="mt-2 w-full rounded-lg border border-noema-border bg-black px-3 py-2 text-sm">
                  <option value="private">Private to owner</option>
                  <option value="invited">Invited guests (future only)</option>
                </select>
              </label>
              <p className="rounded-lg border border-noema-gold/30 bg-[#201811] p-3 text-[11px] leading-5 text-neutral-300">
                These selections do not grant permission to read files, use MCP tools, send messages,
                spend API credits or impersonate you. Guest auto-reply will remain disabled until
                authenticated E2EE delivery, explicit owner approval and consumption limits are implemented.
              </p>
            </section>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">AI Studio</h2>
          <p className="text-xs text-neutral-400">Design identities, typography, behavior and model settings for your agents.</p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-noema-lime px-3 py-2 text-xs font-semibold text-black"
          onClick={async () => {
            const created = await createAgent(createDefaultAgentProfile());
            setEditorTab("identity");
            setEditingAgent(created);
          }}
        >
          New agent
        </button>
      </header>

      <div className="space-y-2">
        {agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-noema-borderSoft bg-[#111113] p-4 text-sm text-neutral-300">
            No agents yet. Create your first agent profile.
          </div>
        ) : (
          agents.map((agent) => {
            const provider = PROVIDER_CATALOG.find((item) => item.id === agent.providerId);
            const model = provider?.models.find((item) => item.modelId === agent.modelId);
            const font = AGENT_FONT_OPTIONS.find((item) => item.id === agent.fontFamily) ?? AGENT_FONT_OPTIONS[0];

            return (
              <article key={agent.id ?? `${agent.name}-${agent.updatedAt}`} className="rounded-xl border border-noema-borderSoft bg-[#111113] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`overflow-hidden border border-noema-borderSoft bg-[#18181b] ${agent.avatarShape === "circle" ? "h-10 w-10 rounded-full" : agent.avatarShape === "portrait" ? "h-12 w-9 rounded-lg" : "h-10 w-10 rounded-lg"}`}>
                      {agent.avatarImage ? <Image src={agent.avatarImage} alt="Agent avatar" width={96} height={96} className="h-full w-full object-cover" unoptimized /> : <div className="flex h-full items-center justify-center text-xs">AI</div>}
                    </div>
                    <div>
                      <p className={`${font.className} text-sm font-semibold`} style={{ color: agent.fontColor }}>{agent.name}</p>
                      <p className="text-xs text-neutral-400">{agent.description || `${provider?.displayName ?? "Provider"} · ${model?.displayName ?? agent.modelId}`}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="rounded-md border border-noema-borderSoft p-1.5 text-neutral-300" onClick={() => { setEditorTab("identity"); setEditingAgent(agent); }}>
                      <Icon icon="solar:pen-bold" />
                    </button>
                    <button type="button" className="rounded-md border border-noema-borderSoft p-1.5 text-neutral-300" onClick={() => void duplicateAgent(agent.id ?? -1)}>
                      <Icon icon="solar:copy-bold" />
                    </button>
                    <button type="button" className="rounded-md border border-rose-300/25 p-1.5 text-rose-200" onClick={() => void deleteAgent(agent.id ?? -1)}>
                      <Icon icon="solar:trash-bin-trash-bold" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {AGENT_ROLE_DEFINITIONS.filter((role) =>
                    normalizeAgentRoles(agent.roleAssignments).includes(role.id)).map((role) => (
                    <span key={role.id} className="inline-flex items-center gap-1 rounded-md border border-noema-border bg-black/40 px-2 py-1 text-[10px] text-neutral-300">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />
                      {role.shortLabel}
                    </span>
                  ))}
                  {normalizeAgentRoles(agent.roleAssignments).length === 0 &&
                    <span className="text-[11px] text-neutral-500">No responsibilities assigned</span>}
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
