import type { GeminiSafetySettings, LockboxRecord, ProviderGenerationSettings, ProviderId } from "@/types/providers";
import { secretCodec, vaultIsUnlocked } from "@/lib/security/secret-codec";
const KEY = "noema-lockbox-v2", OLD = "noema-lockbox-v1";
export interface LockboxInput {
  providerId: ProviderId; apiKey: string; baseUrl: string; defaultModelId: string;
  settings: ProviderGenerationSettings; geminiSafety?: GeminiSafetySettings;
}
const canStore = () => typeof window !== "undefined";
export const hasLegacyLockbox = () => canStore() && window.localStorage.getItem(OLD) !== null;
export function readLockbox(): LockboxRecord[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is LockboxRecord =>
      !!r && typeof r === "object" && typeof r.providerId === "string" &&
      typeof r.apiKeyEncrypted === "string" && r.apiKeyEncrypted.startsWith("v2:"));
  } catch { return []; }
}
export function writeLockbox(records: LockboxRecord[]): void {
  if (!canStore() || !vaultIsUnlocked()) throw new Error("Unlock API Lockbox first.");
  window.localStorage.setItem(KEY, JSON.stringify(records));
}
export async function migrateLegacyLockbox(): Promise<void> {
  if (!hasLegacyLockbox()) return;
  if (!vaultIsUnlocked()) throw new Error("Unlock API Lockbox first.");
  const raw = window.localStorage.getItem(OLD);
  if (!raw) return;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Damaged old vault; manual recovery needed.");
  const next = readLockbox();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const old = entry as Partial<LockboxRecord>;
    if (typeof old.providerId !== "string" || typeof old.apiKeyEncrypted !== "string") continue;
    if (next.some((r) => r.providerId === old.providerId)) continue;
    const apiKeyEncrypted = await secretCodec.encode(old.apiKeyEncrypted);
    next.push({ ...old, apiKeyEncrypted } as LockboxRecord);
  }
  writeLockbox(next);
  window.localStorage.removeItem(OLD);
}
export async function saveProviderSecret(input: LockboxInput): Promise<LockboxRecord[]> {
  if (!vaultIsUnlocked()) throw new Error("Unlock API Lockbox first.");
  if (!input.apiKey.trim()) throw new Error("Nonempty API key required.");
  if (input.providerId === "openai" && input.baseUrl.replace(/\/$/, "") !== "https://api.openai.com/v1")
    throw new Error("OpenAI keys may only be sent to the official endpoint.");
  const nextRecord: LockboxRecord = {
    providerId: input.providerId, apiKeyEncrypted: await secretCodec.encode(input.apiKey.trim()),
    baseUrl: input.baseUrl, defaultModelId: input.defaultModelId, settings: input.settings,
    geminiSafety: input.geminiSafety, updatedAt: new Date().toISOString(),
  };
  const next = [...readLockbox().filter((r) => r.providerId !== input.providerId), nextRecord];
  writeLockbox(next);
  return next;
}
export function removeProviderSecret(id: ProviderId): LockboxRecord[] {
  if (!vaultIsUnlocked()) throw new Error("Unlock API Lockbox first.");
  const next = readLockbox().filter((r) => r.providerId !== id);
  writeLockbox(next);
  return next;
}
export async function revealProviderSecret(record: LockboxRecord | undefined): Promise<string> {
  if (!record) throw new Error("Provider is not configured.");
  return secretCodec.decode(record.apiKeyEncrypted);
}
