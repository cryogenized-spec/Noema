import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, fingerprint, messageText, contextHistory, alias, randomToken,
  verifyDeviceProof, proofBytes, b64url } from "../src/protocol.mjs";
test("invalid messages and aliases are bounded", () => {
  assert.throws(() => messageText(""));
  assert.throws(() => messageText("x".repeat(LIMITS.maxMessageChars + 1)));
  assert.equal(alias("  Moss    Fox "), "Moss Fox");
  assert.notEqual(randomToken(), randomToken());
});
test("full folder dumps never enter agent context", () => {
  const many = Array.from({length:100}, () => ({ sender:"guest", content:"x".repeat(100000) }));
  const result = contextHistory(many);
  assert.equal(result.length, 8);
  assert.ok(result.every((turn) => turn.content.length <= 3000));
});
test("P-256 verified challenge rejects a modified payload", async () => {
  const keys = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, false, ["sign","verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const proof = { deviceId:await fingerprint(publicJwk), publicJwk,
    challenge:"random-server-nonce-at-least-32-characters",
    audience:"https://relay.example", issuedAt:new Date().toISOString() };
  const signature = await crypto.subtle.sign({ name:"ECDSA", hash:"SHA-256" },
    keys.privateKey, proofBytes(proof));
  const signed = { ...proof, signature:b64url(new Uint8Array(signature)) };
  assert.equal(await verifyDeviceProof(signed), true);
  assert.equal(await verifyDeviceProof({ ...signed, challenge:"tampered" }), false);
});
