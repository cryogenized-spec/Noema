import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDeviceIdentity, verifyDeviceProofSignature } from "../src/lib/security/device-identity.ts";
test("device private key is not extractable", async () => {
  const identity = await generateDeviceIdentity();
  assert.equal(identity.privateKey.extractable, false);
  assert.equal(identity.deviceId.length, 43);
  await assert.rejects(() => crypto.subtle.exportKey("jwk", identity.privateKey));
});
test("device proof rejects altered challenge", async () => {
  const identity = await generateDeviceIdentity();
  const fields = {
    deviceId: identity.deviceId,
    challenge: "server-random-challenge-1234567890987654321",
    audience: "https://noema.example",
    issuedAt: new Date().toISOString(),
  };
  const raw = "NOEMA_DEVICE_PROOF_V1\n" +
    JSON.stringify([fields.deviceId, fields.challenge, fields.audience, fields.issuedAt]);
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    identity.privateKey, new TextEncoder().encode(raw)));
  const b64 = btoa(Array.from(signature, (n) => String.fromCharCode(n)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const proof = { ...fields, publicJwk: identity.publicJwk,
    createdAt: identity.createdAt, signature: b64 };
  assert.equal(await verifyDeviceProofSignature(proof), true);
  assert.equal(await verifyDeviceProofSignature({ ...proof, challenge: fields.challenge + "X" }), false);
});
