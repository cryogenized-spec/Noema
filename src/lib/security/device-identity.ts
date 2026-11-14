
/** Device identity foundations. Verification of freshness and replay must be server-side. */
const DB_NAME = "noema-device-id-v1";
const STORE = "identity";
type SavedIdentity = {
  slot: "primary"; version: 1; deviceId: string; publicJwk: JsonWebKey;
  createdAt: string; privateKey: CryptoKey;
};
export type DeviceIdentity = Omit<SavedIdentity, "slot" | "version" | "privateKey">;
export type DeviceProof = DeviceIdentity & {
  challenge: string; audience: string; issuedAt: string; signature: string;
};
const base64url = (value: Uint8Array): string =>
  btoa(Array.from(value, (n) => String.fromCharCode(n)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unbase64url = (value: string): Uint8Array =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const asBuffer = (value: Uint8Array): ArrayBuffer => {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
};
const asBytes = (value: string): ArrayBuffer => asBuffer(new TextEncoder().encode(value));
async function fingerprint(jwk: JsonWebKey): Promise<string> {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) throw new Error("Invalid device public key.");
  const hash = await crypto.subtle.digest("SHA-256", asBytes(JSON.stringify(["NOEMA_DEVICE_V1", jwk.x, jwk.y])));
  return base64url(new Uint8Array(hash));
}
export async function generateDeviceIdentity(): Promise<SavedIdentity> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { slot: "primary", version: 1, deviceId: await fingerprint(publicJwk),
    publicJwk, privateKey: pair.privateKey, createdAt: new Date().toISOString() };
}
function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined" || !crypto?.subtle)
    throw new Error("Secure browser and IndexedDB are required for device identity.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "slot" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Device identity DB unavailable."));
    request.onblocked = () => reject(new Error("Device identity DB upgrade blocked by another tab."));
  });
}
function readSaved(db: IDBDatabase): Promise<SavedIdentity | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get("primary");
    req.onsuccess = () => resolve(req.result as SavedIdentity | undefined);
    req.onerror = () => reject(req.error ?? new Error("Cannot load device identity."));
  });
}
function storeOnce(db: IDBDatabase, next: SavedIdentity): Promise<SavedIdentity> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let result = next;
    const req = store.get("primary");
    req.onsuccess = () => {
      if (req.result) result = req.result as SavedIdentity;
      else store.put(next);
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("Cannot persist device identity."));
    tx.onabort = () => reject(tx.error ?? new Error("Device identity transaction aborted."));
  });
}
async function loadOrCreate(): Promise<SavedIdentity> {
  const db = await openDb();
  try {
    const saved = (await readSaved(db)) ?? (await storeOnce(db, await generateDeviceIdentity()));
    if (saved.version !== 1 || saved.privateKey?.extractable !== false ||
        saved.privateKey.algorithm.name !== "ECDSA" ||
        saved.deviceId !== await fingerprint(saved.publicJwk))
      throw new Error("Stored device identity is invalid; refusing automatic overwrite.");
    return saved;
  } finally { db.close(); }
}
export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const { deviceId, publicJwk, createdAt } = await loadOrCreate();
  return { deviceId, publicJwk, createdAt };
}
function proofData(fields: { deviceId: string; challenge: string; audience: string; issuedAt: string }): ArrayBuffer {
  return asBytes("NOEMA_DEVICE_PROOF_V1\n" +
    JSON.stringify([fields.deviceId, fields.challenge, fields.audience, fields.issuedAt]));
}
export async function signDeviceChallenge(challenge: string, audience: string): Promise<DeviceProof> {
  if (challenge.length < 24 || challenge.length > 512) throw new Error("Invalid server challenge.");
  const origin = new URL(audience);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && origin.hostname === "localhost"))
    throw new Error("Device proof requires an HTTPS audience or localhost.");
  const identity = await loadOrCreate();
  const fields = { deviceId: identity.deviceId, challenge, audience: origin.origin,
    issuedAt: new Date().toISOString() };
  const signed = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, identity.privateKey, proofData(fields));
  return { ...fields, publicJwk: identity.publicJwk, createdAt: identity.createdAt,
    signature: base64url(new Uint8Array(signed)) };
}
export async function verifyDeviceProofSignature(proof: DeviceProof): Promise<boolean> {
  if (proof.deviceId !== await fingerprint(proof.publicJwk)) return false;
  const publicKey = await crypto.subtle.importKey("jwk", proof.publicJwk,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" },
    publicKey, asBuffer(unbase64url(proof.signature)), proofData(proof));
}
