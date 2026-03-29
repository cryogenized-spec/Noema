"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import { useLockboxStore } from "@/store/lockbox-store";
import type {
  GeminiSafetySettings,
  ProviderGenerationSettings,
  ProviderModel,
  SettingKey,
} from "@/types/providers";

const settingLabels: Record<string, string> = {
  temperature: "Temperature",
  topP: "Top P",
  topK: "Top K",
  presencePenalty: "Presence Penalty",
  frequencyPenalty: "Frequency Penalty",
  seed: "Seed",
  reasoningEffort: "Reasoning Effort",
  maxOutputTokens: "Max Output Tokens",
};

const SAFETY_LEVELS = ["BLOCK_NONE", "BLOCK_ONLY_HIGH", "BLOCK_MEDIUM_AND_ABOVE", "BLOCK_LOW_AND_ABOVE"] as const;

const defaultGeminiSafety: GeminiSafetySettings = {
  harassment: "BLOCK_NONE",
  hateSpeech: "BLOCK_NONE",
  sexuallyExplicit: "BLOCK_NONE",
  dangerousContent: "BLOCK_NONE",
};

const modelSupportsSetting = (model: ProviderModel, key: string) => {
  const map: Record<string, boolean> = {
    temperature: model.supportsTemperature,
    topP: model.supportsTopP,
    topK: model.supportsTopK,
    presencePenalty: model.supportsPresencePenalty,
    frequencyPenalty: model.supportsFrequencyPenalty,
    seed: model.supportsSeed,
    reasoningEffort: model.supportsReasoningEffort,
    maxOutputTokens: true,
  };
  return map[key] ?? false;
};

export function ApiLockboxScreen() {
  const { records, hydrate, hydrated, saveProvider, removeProvider, revealKey } = useLockboxStore();
  const [openProviderId, setOpenProviderId] = useState<string | null>(PROVIDER_CATALOG[0]?.id ?? null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        apiKey: string;
        baseUrl: string;
        defaultModelId: string;
        settings: ProviderGenerationSettings;
        geminiSafety: GeminiSafetySettings;
      }
    >
  >({});

  useEffect(() => {
    if (!hydrated) {
      hydrate();
    }
  }, [hydrate, hydrated]);

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      PROVIDER_CATALOG.map((provider) => {
        const record = records.find((item) => item.providerId === provider.id);
        return [
          provider.id,
          {
            apiKey: "",
            baseUrl: record?.baseUrl ?? provider.baseUrl,
            defaultModelId: record?.defaultModelId ?? provider.models[0].modelId,
            settings: record?.settings ?? {},
            geminiSafety: record?.geminiSafety ?? defaultGeminiSafety,
          },
        ];
      }),
    );

    setDrafts((prev) => ({ ...nextDrafts, ...prev }));
  }, [records]);

  const configuredIds = useMemo(() => new Set(records.map((record) => record.providerId)), [records]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-3">
      <header className="rounded-xl border border-noema-borderSoft bg-slate-950/55 p-3">
        <h2 className="text-base font-semibold text-slate-100">API Lockbox</h2>
        <p className="mt-1 text-xs text-slate-400">
          BYOK credentials are stored locally on this device for this phase. Connector integrations are deferred.
        </p>
      </header>

      <div className="space-y-2">
        {PROVIDER_CATALOG.map((provider) => {
          const open = openProviderId === provider.id;
          const draft = drafts[provider.id];
          const model = provider.models.find((item) => item.modelId === draft?.defaultModelId) ?? provider.models[0];
          const configured = configuredIds.has(provider.id);

          return (
            <article key={provider.id} className="rounded-xl border border-noema-border bg-noema-panel">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3"
                onClick={() => setOpenProviderId((current) => (current === provider.id ? null : provider.id))}
              >
                <div className="flex items-center gap-3">
                  <Image
                    src={provider.logoPath}
                    alt={`${provider.displayName} logo`}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-md bg-slate-900/70 p-1"
                  />
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-100">{provider.displayName}</p>
                    <p className={`text-xs ${configured ? "text-emerald-400" : "text-slate-400"}`}>
                      {configured ? "Configured" : "Not configured"}
                    </p>
                  </div>
                </div>
                <Icon icon={open ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"} className="text-slate-300" />
              </button>

              {open && draft && (
                <div className="space-y-3 border-t border-noema-borderSoft p-3">
                  <label className="block text-xs text-slate-300">
                    API Key
                    <div className="mt-1 flex gap-2">
                      <input
                        type={revealedKeys[provider.id] ? "text" : "password"}
                        value={revealedKeys[provider.id] ?? draft.apiKey}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [provider.id]: { ...prev[provider.id], apiKey: event.target.value },
                          }))
                        }
                        placeholder={provider.keyPlaceholder}
                        className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-noema-borderSoft bg-slate-900/70 px-2 text-slate-300"
                        onClick={async () => {
                          if (revealedKeys[provider.id]) {
                            setRevealedKeys((prev) => ({ ...prev, [provider.id]: "" }));
                            return;
                          }
                          const key = await revealKey(provider.id);
                          setRevealedKeys((prev) => ({ ...prev, [provider.id]: key }));
                        }}
                      >
                        {revealedKeys[provider.id] ? "Hide" : "Reveal"}
                      </button>
                    </div>
                  </label>

                  <label className="block text-xs text-slate-300">
                    Base URL
                    <input
                      value={draft.baseUrl}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [provider.id]: { ...prev[provider.id], baseUrl: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>

                  <label className="block text-xs text-slate-300">
                    Default Model
                    <select
                      value={draft.defaultModelId}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [provider.id]: { ...prev[provider.id], defaultModelId: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    >
                      {provider.models.map((item) => (
                        <option key={item.modelId} value={item.modelId}>
                          {item.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-lg border border-noema-borderSoft bg-slate-950/50 p-2 text-xs text-slate-300">
                    <p className="font-medium text-slate-200">Model pricing (read-only)</p>
                    <p className="mt-1">Input: {model.inputPricePer1M === null ? "N/A" : `$${model.inputPricePer1M}`} / 1M</p>
                    <p>Output: {model.outputPricePer1M === null ? "N/A" : `$${model.outputPricePer1M}`} / 1M</p>
                    <p>Currency: {model.currency}</p>
                    <p>Last verified: {provider.lastVerified}</p>
                  </div>

                  {provider.id === "gemini" && (
                    <div className="rounded-lg border border-noema-borderSoft bg-slate-950/50 p-2 text-xs text-slate-300">
                      <p className="mb-2 font-medium text-slate-200">Gemini safety filters (default BLOCK_NONE)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(defaultGeminiSafety) as (keyof GeminiSafetySettings)[]).map((category) => (
                          <label key={category} className="text-slate-300">
                            <span className="block capitalize text-slate-300">{category}</span>
                            <select
                              value={draft.geminiSafety[category]}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [provider.id]: {
                                    ...prev[provider.id],
                                    geminiSafety: {
                                      ...prev[provider.id].geminiSafety,
                                      [category]: event.target.value as GeminiSafetySettings[typeof category],
                                    },
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-md border border-noema-borderSoft bg-slate-900/70 px-2 py-1 text-xs text-slate-100"
                            >
                              {SAFETY_LEVELS.map((level) => (
                                <option key={level} value={level}>
                                  {level}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-noema-borderSoft bg-slate-950/50 p-2 text-xs text-slate-300">
                    <p className="mb-2 font-medium text-slate-200">Supported controls</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(settingLabels) as [SettingKey, string][]).map(([key, label]) => {
                        const supported = modelSupportsSetting(model, key);
                        return (
                          <label key={key} className="text-slate-300">
                            <span className={`block ${supported ? "text-slate-300" : "text-slate-500"}`}>{label}</span>
                            {supported ? (
                              <input
                                value={String(draft.settings[key] ?? "")}
                                onChange={(event) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [provider.id]: {
                                      ...prev[provider.id],
                                      settings: { ...prev[provider.id].settings, [key]: event.target.value },
                                    },
                                  }))
                                }
                                className="mt-1 w-full rounded-md border border-noema-borderSoft bg-slate-900/70 px-2 py-1 text-xs text-slate-100"
                                placeholder="auto"
                              />
                            ) : (
                              <div className="mt-1 rounded-md border border-noema-borderSoft bg-slate-900/40 px-2 py-1 text-xs text-slate-500">
                                Unavailable
                              </div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {provider.notes} {model.notes}
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white"
                      onClick={async () => {
                        await saveProvider({
                          providerId: provider.id,
                          apiKey: revealedKeys[provider.id] || draft.apiKey,
                          baseUrl: draft.baseUrl,
                          defaultModelId: draft.defaultModelId,
                          settings: draft.settings,
                          geminiSafety: provider.id === "gemini" ? draft.geminiSafety : undefined,
                        });
                        setRevealedKeys((prev) => ({ ...prev, [provider.id]: "" }));
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-noema-borderSoft bg-slate-900/65 px-3 py-2 text-xs text-slate-300"
                      onClick={() => removeProvider(provider.id)}
                    >
                      Remove
                    </button>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto rounded-lg border border-noema-borderSoft bg-slate-900/65 px-3 py-2 text-xs text-slate-300"
                    >
                      Docs
                    </a>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="rounded-xl border border-dashed border-noema-borderSoft bg-slate-900/35 p-3 text-xs text-slate-400">
        Connectors (future): GitHub, Notion, Drive, and storage integrations will appear here.
      </section>
    </section>
  );
}
