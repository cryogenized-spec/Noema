import {test} from "node:test";
import assert from "node:assert/strict";
import {
  generateInviteSecret,importInviteSecret,encryptEnvelope,decryptEnvelope,
} from "../src/lib/network/contact-cipher.ts";
import {
  deviceFingerprint,deviceProofBytes,importSecret,seal,open,inviteKeyFromHash,
} from "../guest-public/crypto.mjs";
import {fingerprint,proofBytes} from "../relay/src/protocol.mjs";

test("public guest and owner crypto interoperate in both directions",async()=>{
  const secret=generateInviteSecret();
  const original=await importInviteSecret(secret);
  const guest=await importSecret(secret);
  const thread="thread_shared_123456789";
  const id1="guest-hello-message-01234567";
  const id2="owner-hello-message-01234567";
  const guestMessage=await seal(guest,thread,id1,"Hello from a public browser");
  const ownerMessage=await encryptEnvelope(original,thread,id2,"Your owner can read this.");
  assert.equal(await decryptEnvelope(original,thread,id1,guestMessage),"Hello from a public browser");
  assert.equal(await open(guest,thread,id2,ownerMessage),"Your owner can read this.");
  await assert.rejects(open(guest,thread,"modified-id",ownerMessage));
  assert.equal(inviteKeyFromHash("#k="+secret),secret);
  assert.equal(inviteKeyFromHash("?k="+secret),"");
});
test("guest signed device fingerprint and challenge match server proof bytes",async()=>{
  const kp=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",kp.publicKey);
  assert.equal(await deviceFingerprint(jwk),await fingerprint(jwk));
  const f={
    deviceId:await fingerprint(jwk),
    challenge:"challenge_".repeat(4),
    audience:"https://noema-contact-relay-staging.cryogenized.workers.dev",
    issuedAt:"2026-11-18T16:00:00.000Z",
  };
  assert.deepEqual(new Uint8Array(deviceProofBytes(f.deviceId,f.challenge,f.audience,f.issuedAt)),
    new Uint8Array(proofBytes(f)));
});
