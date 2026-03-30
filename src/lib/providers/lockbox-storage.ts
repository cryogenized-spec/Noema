import type { GeminiSafetySettings, LockboxRecord, ProviderGenerationSettings, ProviderId } from "@/types/providers";
import { secretCodec } from "@/lib/security/secret-codec";

const STORAGE_KEY = "noema-lockbox-v1";

export interface LockboxInput {
  providerId: ProviderId;
  apiKey: string;
  baseUrl: string;
  defaultModelId: string;
  settings: ProviderGenerationSettings;
  geminiSafety?: GeminiSafetySettings;
}

const canUseStorage = () => typeof window !== "undefined";

export const readLockbox = (): LockboxRecord[] => {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as LockboxRecord[];
  } catch {
    return [];
  }
};

export const writeLockbox = (records: LockboxRecord[]) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

export const saveProviderSecret = async (input: LockboxInput) => {
  const records = readLockbox();
  const apiKeyEncrypted = await secretCodec.encode(input.apiKey);

  const nextRecord: LockboxRecord = {
    providerId: input.providerId,
    apiKeyEncrypted,
    baseUrl: input.baseUrl,
    defaultModelId: input.defaultModelId,
    settings: input.settings,
    geminiSafety: input.geminiSafety,
    updatedAt: new Date().toISOString(),
  };

  const next = [...records.filter((item) => item.providerId !== input.providerId), nextRecord];
  writeLockbox(next);
  return next;
};

export const removeProviderSecret = (providerId: ProviderId) => {
  const records = readLockbox();
  const next = records.filter((item) => item.providerId !== providerId);
  writeLockbox(next);
  return next;
};

export const revealProviderSecret = async (record: LockboxRecord | undefined) => {
  if (!record) return "";
  return secretCodec.decode(record.apiKeyEncrypted);
};
