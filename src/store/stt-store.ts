"use client";

import { create } from "zustand";
import type { OpenAiTranscriptionModel, SttPreferences, SttProviderId } from "@/types/stt";

const STORAGE_KEY = "noema-stt-preferences";

const defaults: SttPreferences = {
  provider: "openai",
  openaiModel: "gpt-4o-mini-transcribe",
  language: "",
  rememberLastProvider: true,
};

interface SttState extends SttPreferences {
  hydrated: boolean;
  hydrate: () => void;
  updateProvider: (provider: SttProviderId) => void;
  updateOpenAiModel: (model: OpenAiTranscriptionModel) => void;
  updateLanguage: (language: string) => void;
  updateRememberLastProvider: (remember: boolean) => void;
}

const persist = (state: SttPreferences) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const selectPersistable = (state: SttState): SttPreferences => ({
  provider: state.provider,
  openaiModel: state.openaiModel,
  language: state.language,
  rememberLastProvider: state.rememberLastProvider,
});

export const useSttStore = create<SttState>((set, get) => ({
  ...defaults,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    if (typeof window === "undefined") {
      set({ hydrated: true });
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as Partial<SttPreferences>;
      set({
        provider: parsed.provider ?? defaults.provider,
        openaiModel: parsed.openaiModel ?? defaults.openaiModel,
        language: parsed.language ?? defaults.language,
        rememberLastProvider: parsed.rememberLastProvider ?? defaults.rememberLastProvider,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
  updateProvider: (provider) => {
    const next = { ...selectPersistable(get()), provider };
    persist(next);
    set({ provider });
  },
  updateOpenAiModel: (openaiModel) => {
    const next = { ...selectPersistable(get()), openaiModel };
    persist(next);
    set({ openaiModel });
  },
  updateLanguage: (language) => {
    const normalized = language.trim();
    const next = { ...selectPersistable(get()), language: normalized };
    persist(next);
    set({ language: normalized });
  },
  updateRememberLastProvider: (rememberLastProvider) => {
    const next = { ...selectPersistable(get()), rememberLastProvider };
    persist(next);
    set({ rememberLastProvider });
  },
}));
