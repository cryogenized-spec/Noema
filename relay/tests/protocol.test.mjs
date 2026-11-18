import {test} from "node:test";
import assert from "node:assert/strict";
import {LIMITS, fingerprint, b64url, proofBytes, messageText,randomToken,verifyDeviceProof,alias} from "../src/protocol.mjs";

test("the relay only accepts bounded opaque AES-GCM envelopes",()=>{
  const valid="enc1."+"A".repeat(16)+"."+"B".repeat(32);
  assert.equal(messageText(valid),valid);
  for(const bad of ["Hello","", "<script>alert(1)</script>",
    "enc1.invalid."+("B".repeat(32)),"enc1."+"A".repeat(16)+".xyz",
    "enc1."+"A".repeat(16)+"."+"B".repeat(LIMITS.maxMessageChars)])
    assert.throws(()=>messageText(bad),bad.slice(0,50));
  assert.equal(alias("  Violet    Atlas "), "Violet Atlas");
  assert.notEqual(randomToken(),randomToken());
});
test("device signatures require the original challenge and audience",async()=>{
  const keys=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
  const input={deviceId:await fingerprint(publicJwk),publicJwk,
    challenge:"some-random-challenge-token-123456789",
    audience:"https://relay.example",issuedAt:new Date().toISOString()};
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},keys.privateKey,proofBytes(input));
  const proof={...input,signature:b64url(new Uint8Array(sig))};
  assert.equal(await verifyDeviceProof(proof),true);
  assert.equal(await verifyDeviceProof({...proof,audience:"https://evil.example"}),false);
  assert.equal(await verifyDeviceProof({...proof,challenge:"tampered"}),false);
});
