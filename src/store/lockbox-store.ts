"use client";

import { create } from "zustand";
import type { GeminiSafetySettings, LockboxRecord, ProviderGenerationSettings, ProviderId } from "@/types/providers";
import {
  readLockbox,
  removeProviderSecret,
  revealProviderSecret,
  saveProviderSecret,
} from "@/lib/providers/lockbox-storage";

interface LockboxState {
  records: LockboxRecord[];
  hydrated: boolean;
  hydrate: () => void;
  saveProvider: (payload: {
    providerId: ProviderId;
    apiKey: string;
    baseUrl: string;
    defaultModelId: string;
    settings: ProviderGenerationSettings;
    geminiSafety?: GeminiSafetySettings;
  }) => Promise<void>;
  removeProvider: (providerId: ProviderId) => void;
  revealKey: (providerId: ProviderId) => Promise<string>;
}

export const useLockboxStore = create<LockboxState>((set, get) => ({
  records: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ records: readLockbox(), hydrated: true });
  },
  saveProvider: async (payload) => {
    const records = await saveProviderSecret(payload);
    set({ records });
  },
  removeProvider: (providerId) => {
    const records = removeProviderSecret(providerId);
    set({ records });
  },
  revealKey: async (providerId) => {
    const record = get().records.find((item) => item.providerId === providerId);
    return revealProviderSecret(record);
  },
}));
