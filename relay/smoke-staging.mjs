/** Live staging smoke test, intentionally creates only an ephemeral non-owner device.
 * No invitations, conversations, secret keys, external AI calls, or real messages.
 */
import assert from "node:assert/strict";
import { b64url, fingerprint, proofBytes } from "./src/protocol.mjs";

const base="https://noema-contact-relay-staging.cryogenized.workers.dev";
const origin="https://noema-contact-staging.vercel.app";

async function request(path,method="GET",payload,requestOrigin=origin,token=""){
  const response=await fetch(base+path,{
    method,
    headers:{"Origin":requestOrigin,
      ...(payload!==undefined?{"Content-Type":"application/json"}:{}),
      ...(token?{"Authorization":"Bearer "+token}:{})},
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{}),
    cache:"no-store",
    signal:AbortSignal.timeout(15000),
  });
  const content=await response.json().catch(()=>null);
  return {status:response.status,content};
}
async function main(){
  const anonymous=await request("/v1/identity");
  assert.equal(anonymous.status,401,"Anonymous identity request must be rejected");
  const badOrigin=await request("/v1/identity","GET",undefined,"https://unauthorized.example");
  assert.equal(badOrigin.status,403,"Foreign origin must be rejected");
  const keys=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
  const deviceId=await fingerprint(publicJwk);
  const challenge=await request("/v1/auth/challenge","POST",{deviceId,publicJwk});
  assert.equal(challenge.status,200,"Staging challenge failed");
  assert.equal(typeof challenge.content?.challenge,"string");
  const proof={
    deviceId,publicJwk,challenge:challenge.content.challenge,
    audience:base,issuedAt:new Date().toISOString(),
  };
  const raw=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},keys.privateKey,proofBytes(proof));
  const signature=b64url(new Uint8Array(raw));
  const verified=await request("/v1/auth/verify","POST",{...proof,signature});
  assert.equal(verified.status,200,"Staging device proof failed");
  const bearer=verified.content?.token;
  assert.equal(typeof bearer,"string");
  assert.equal(verified.content?.deviceId,deviceId);
  const replay=await request("/v1/auth/verify","POST",{...proof,signature});
  assert.equal(replay.status,401,"Challenge replay must be denied");
  const identity=await request("/v1/identity","GET",undefined,origin,bearer);
  assert.equal(identity.status,200,"Signed guest identity must work");
  assert.equal(identity.content?.owner,false,"Synthetic guest must never become owner");
  assert.equal(identity.content?.deviceId,deviceId);
  const policy=await request("/v1/reception/policy","GET",undefined,origin,bearer);
  assert.equal(policy.status,403,"Guest must not inspect reception policy");
  const invite=await request("/v1/invites","POST",{keyId:"staging-synthetic-key-id-001"},origin,bearer);
  assert.equal(invite.status,403,"Guest must not issue invitations");
  const rooms=await request("/v1/threads","GET",undefined,origin,bearer);
  assert.equal(rooms.status,200);
  assert.deepEqual(rooms.content?.threads,[],"Synthetic guest has no conversations");
  console.log("LIVE CF smoke passed: challenge signing, guest identity, replay protection, owner-only invite/reception and origin denial.");
}
await main();
