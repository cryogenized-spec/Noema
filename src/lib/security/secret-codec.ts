const META_KEY = "noema-vault-meta-v2";
let key: CryptoKey | null = null;
const b64 = (a: Uint8Array) => btoa(Array.from(a, (n) => String.fromCharCode(n)).join(""));
const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(text: string, k: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(text)));
  return "v2:" + b64(iv) + ":" + b64(bytes);
}
async function unseal(text: string, k: CryptoKey): Promise<string> {
  const parts = text.split(":");
  if (parts.length !== 3 || parts[0] !== "v2") throw new Error("Not an encrypted vault entry.");
  const iv = un64(parts[1]);
  if (iv.length !== 12) throw new Error("Invalid vault nonce.");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, un64(parts[2])));
}
export const vaultIsConfigured = (): boolean => typeof window !== "undefined" && !!window.localStorage.getItem(META_KEY);
export const vaultIsUnlocked = (): boolean => key !== null;
export function lockVault(): void { key = null; }
export async function unlockVault(passphrase: string): Promise<void> {
  key = null;
  if (typeof window === "undefined" || !globalThis.crypto?.subtle) throw new Error("Secure WebCrypto context is required.");
  if (passphrase.length < 12) throw new Error("Passphrase must contain at least 12 characters.");
  const stored = window.localStorage.getItem(META_KEY);
  if (stored) {
    let meta: { version: number; salt: string; proof: string };
    try {
      meta = JSON.parse(stored) as typeof meta;
      if (meta.version !== 2 || !meta.salt || !meta.proof) throw new Error("Bad metadata");
    } catch { throw new Error("Vault metadata damaged; refusing overwrite."); }
    const candidate = await derive(passphrase, un64(meta.salt));
    try {
      if ((await unseal(meta.proof, candidate)) !== "NOEMA_VAULT_V2") throw new Error("Wrong passphrase");
    } catch { throw new Error("Wrong passphrase or corrupted vault."); }
    key = candidate;
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const candidate = await derive(passphrase, salt);
  window.localStorage.setItem(META_KEY, JSON.stringify({ version: 2, salt: b64(salt), proof: await seal("NOEMA_VAULT_V2", candidate) }));
  key = candidate;
}
export interface SecretCodec {
  encode: (value: string) => Promise<string>;
  decode: (value: string) => Promise<string>;
  strategy: "webcrypto";
}
export const secretCodec: SecretCodec = {
  strategy: "webcrypto",
  encode: (value) => {
    if (!key) throw new Error("Unlock API Lockbox first.");
    return seal(value, key);
  },
  decode: (value) => {
    if (!key) throw new Error("Unlock API Lockbox first.");
    return unseal(value, key);
  },
};
