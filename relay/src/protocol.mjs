/** Shared pilot-relay security primitives. Pseudonyms never prove identity. */
export const LIMITS = Object.freeze({
  maxMessageChars: 4000, maxHistory: 50, inviteLifetimeMs: 86400000,
  challengeLifetimeMs: 120000, sessionLifetimeMs: 86400000,
  maxRequestsPerMinute: 80, agentCallsPerDay: 20,
  agentMaxOutputTokens: 768, agentContextTurns: 8, agentTurnChars: 3000,
});
export const utf8 = (text) => new TextEncoder().encode(text);
export const b64url = (bytes) =>
  btoa(Array.from(bytes, (v) => String.fromCharCode(v)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (text) => {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text)) throw Error("Invalid encoding.");
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
};
export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async (text) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(text))),
    (v) => v.toString(16).padStart(2, "0")).join("");
export const fingerprint = async (jwk) => {
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" ||
      typeof jwk.x !== "string" || typeof jwk.y !== "string")
    throw Error("Invalid device P-256 key.");
  const data = JSON.stringify(["NOEMA_DEVICE_V1", jwk.x, jwk.y]);
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(data))));
};
export const alias = (value) => typeof value === "string"
  ? value.trim().replace(/\s+/g, " ").slice(0, 32) : "";
export const messageText = (value) => {
  if (typeof value !== "string" || !value.trim() || value.length > LIMITS.maxMessageChars)
    throw Error("Message must contain 1 to 4000 characters.");
  return value.trim();
};
export const proofBytes = (proof) =>
  utf8("NOEMA_DEVICE_PROOF_V1\n" +
    JSON.stringify([proof.deviceId, proof.challenge, proof.audience, proof.issuedAt]));
export const verifyDeviceProof = async (proof) => {
  if (!proof || typeof proof !== "object" || typeof proof.deviceId !== "string" ||
      typeof proof.challenge !== "string" || typeof proof.issuedAt !== "string" ||
      typeof proof.audience !== "string" || typeof proof.signature !== "string" ||
      proof.signature.length > 250 || !proof.publicJwk) return false;
  try {
    if (proof.deviceId !== await fingerprint(proof.publicJwk)) return false;
    const publicKey = await crypto.subtle.importKey("jwk", proof.publicJwk,
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" },
      publicKey, unb64url(proof.signature), proofBytes(proof));
  } catch { return false; }
};
export const isId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{12,90}$/.test(value);
export const sameOrigin = (source, target) => {
  try { return new URL(source).origin === new URL(target).origin; }
  catch { return false; }
};
export const contextHistory = (items) =>
  items.slice(-LIMITS.agentContextTurns)
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({
      role: m.sender === "owner" || m.sender === "agent" ? "assistant" : "user",
      content: m.content.slice(0, LIMITS.agentTurnChars),
    }));
