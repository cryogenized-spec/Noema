"use client";
import { create } from "zustand";
import type { GeminiSafetySettings, LockboxRecord, ProviderGenerationSettings, ProviderId } from "@/types/providers";
import { readLockbox, saveProviderSecret, removeProviderSecret, revealProviderSecret, migrateLegacyLockbox, hasLegacyLockbox } from "@/lib/providers/lockbox-storage";
import { lockVault, unlockVault, vaultIsConfigured, vaultIsUnlocked } from "@/lib/security/secret-codec";

let unlockRequestGeneration = 0;

interface LockboxState {
  records: LockboxRecord[]; hydrated: boolean; unlocked: boolean; hasVault: boolean; hasLegacy: boolean;
  hydrate: () => void; unlock: (password: string) => Promise<void>; lock: () => void;
  saveProvider: (payload: { providerId: ProviderId; apiKey: string; baseUrl: string; defaultModelId: string;
    settings: ProviderGenerationSettings; geminiSafety?: GeminiSafetySettings }) => Promise<void>;
  removeProvider: (id: ProviderId) => void;
  revealKey: (id: ProviderId) => Promise<string>;
}
export const useLockboxStore = create<LockboxState>((set, get) => ({
  records: [], hydrated: false, unlocked: false, hasVault: false, hasLegacy: false,
  hydrate: () => set({ records: readLockbox(), hydrated: true, unlocked: vaultIsUnlocked(),
    hasVault: vaultIsConfigured(), hasLegacy: hasLegacyLockbox() }),
  unlock: async (password) => {
    const requestId = ++unlockRequestGeneration;
    try {
      await unlockVault(password);
      if (requestId !== unlockRequestGeneration || !vaultIsUnlocked())
        throw Error("Vault unlock was cancelled.");
      await migrateLegacyLockbox();
      if (requestId !== unlockRequestGeneration || !vaultIsUnlocked())
        throw Error("Vault unlock was cancelled.");
      set({ records: readLockbox(), hydrated: true, unlocked: true, hasVault: true, hasLegacy: false });
    } catch (error) {
      if (requestId === unlockRequestGeneration) {
        lockVault();
        set({ unlocked: false });
      }
      throw error;
    }
  },
  lock: () => { ++unlockRequestGeneration; lockVault(); set({ unlocked: false }); },
  saveProvider: async (payload) => { const records = await saveProviderSecret(payload); set({ records }); },
  removeProvider: (id) => { const records = removeProviderSecret(id); set({ records }); },
  revealKey: async (id) => {
    if (!get().unlocked) throw new Error("Unlock API Lockbox first.");
    return revealProviderSecret(get().records.find((row) => row.providerId === id));
  },
}));
