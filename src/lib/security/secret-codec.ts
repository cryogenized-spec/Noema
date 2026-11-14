const META_KEY = "noema-vault-meta-v2";
const LOCK_NAME = "noema-vault-init-v2";
let key: CryptoKey | null = null;
let activeMeta: string | null = null;
const b64 = (a: Uint8Array) => btoa(Array.from(a, (n) => String.fromCharCode(n)).join(""));
const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase),
    "PBKDF2", false, ["deriveKey"]);
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: saltBuffer,
    iterations: 310000, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(text: string, k: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv },
    k, new TextEncoder().encode(text)));
  return "v2:" + b64(iv) + ":" + b64(bytes);
}
async function unseal(text: string, k: CryptoKey): Promise<string> {
  const parts = text.split(":");
  if (parts.length !== 3 || parts[0] !== "v2") throw Error("Not a sealed vault entry.");
  const iv = un64(parts[1] ?? "");
  if (iv.length !== 12) throw Error("Invalid vault nonce.");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv },
    k, un64(parts[2] ?? "")));
}
function activeKey(): CryptoKey {
  // A stale tab must not encrypt anything using an overwritten master key.
  if (!key || !activeMeta || typeof window === "undefined" ||
      window.localStorage.getItem(META_KEY) !== activeMeta) {
    key = null; activeMeta = null;
    throw Error("Vault is locked or was changed in another tab. Unlock again.");
  }
  return key;
}
export const vaultIsConfigured = (): boolean =>
  typeof window !== "undefined" && !!window.localStorage.getItem(META_KEY);
export const vaultIsUnlocked = (): boolean =>
  key !== null && activeMeta !== null && typeof window !== "undefined" &&
  window.localStorage.getItem(META_KEY) === activeMeta;
export function lockVault(): void { key = null; activeMeta = null; }

/** Vault creation is serialized across browser tabs. No Web Locks => no unsafe creation. */
export async function unlockVault(passphrase: string): Promise<void> {
  lockVault();
  if (typeof window === "undefined" || !globalThis.crypto?.subtle)
    throw Error("A secure WebCrypto browser is required.");
  if (passphrase.length < 12) throw Error("Passphrase needs at least 12 characters.");
  const unlockUnderLock = async () => {
    // Read metadata *inside* the lock, not before waiting on another tab.
    const stored = window.localStorage.getItem(META_KEY);
    if (stored) {
      let meta: { version: number; salt: string; proof: string };
      try {
        meta = JSON.parse(stored) as typeof meta;
        if (meta.version !== 2 || !meta.salt || !meta.proof) throw Error("Bad metadata");
      } catch { throw Error("Vault metadata damaged; refusing overwrite."); }
      const candidate = await derive(passphrase, un64(meta.salt));
      try {
        if ((await unseal(meta.proof, candidate)) !== "NOEMA_VAULT_V2")
          throw Error("Wrong passphrase");
      } catch { throw Error("Wrong passphrase or corrupted vault."); }
      // The winning metadata may have changed while PBKDF2 was running.
      if (window.localStorage.getItem(META_KEY) !== stored)
        throw Error("Vault changed during unlock. Retry.");
      key = candidate; activeMeta = stored;
      return;
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const candidate = await derive(passphrase, salt);
    const proposed = JSON.stringify({
      version: 2, salt: b64(salt), proof: await seal("NOEMA_VAULT_V2", candidate),
    });
    // No second tab using this application can initialize while the lock is held.
    if (window.localStorage.getItem(META_KEY))
      throw Error("Another tab initialized this vault. Retry.");
    window.localStorage.setItem(META_KEY, proposed);
    if (window.localStorage.getItem(META_KEY) !== proposed)
      throw Error("Vault metadata changed; refusing to retain a stale key.");
    key = candidate; activeMeta = proposed;
  };
  const lockManager = window.navigator?.locks;
  if (!lockManager?.request) {
    if (!window.localStorage.getItem(META_KEY))
      throw Error("This browser lacks cross-tab Web Locks; secure vault creation is unavailable.");
    await unlockUnderLock();
    return;
  }
  await lockManager.request(LOCK_NAME, { mode:"exclusive" }, unlockUnderLock);
}
export interface SecretCodec {
  encode(value: string): Promise<string>;
  decode(value: string): Promise<string>;
  strategy: "webcrypto";
}
export const secretCodec: SecretCodec = {
  strategy: "webcrypto",
  encode: (value) => seal(value, activeKey()),
  decode: (value) => unseal(value, activeKey()),
};
