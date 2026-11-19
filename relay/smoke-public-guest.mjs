import assert from "node:assert/strict";
import {fingerprint,b64url,proofBytes} from "./src/protocol.mjs";

const BASE="https://noema-contact-relay-staging.cryogenized.workers.dev";
const GUEST="https://noema-guest.vercel.app";
const OWNER="https://noema-contact-staging.vercel.app";
async function req(path,method,origin,requestedMethod){
  const headers={"Origin":origin};
  if(requestedMethod)headers["Access-Control-Request-Method"]=requestedMethod;
  return fetch(BASE+path,{method,headers,cache:"no-store",signal:AbortSignal.timeout(16000)});
}
async function main(){
  const home=await fetch(GUEST+"/",{redirect:"manual",signal:AbortSignal.timeout(16000)});
  assert.equal(home.status,200,"Permanent guest beta URL must be public and available");
  const html=await home.text();
  assert.ok(html.includes("NOEMA")&&html.includes('id="chat"'),
    "Guest URL must deliver the actual messaging UI, not a Vercel login");
  const script=await fetch(GUEST+"/app.js",{signal:AbortSignal.timeout(16000)});
  assert.equal(script.status,200);
  assert.ok((await script.text()).includes('get("invite")'),
    "Guest must parse new fragment-only invitation links");
  const sw=await fetch(GUEST+"/noema-push-sw.js",{signal:AbortSignal.timeout(16000)});
  assert.equal(sw.status,200,"Guest service worker must be on the public origin");
  const workerBody=await sw.text();
  assert.ok(workerBody.includes('showNotification("New NOEMA message"'),
    "Guest notification worker must display only generic alerts");
  assert.ok(!workerBody.includes("inviteSecret")&&!workerBody.includes("message.text"),
    "Guest service worker must never expose conversation content");
  const pushPreflight=await req("/v1/push/config","OPTIONS",GUEST,"GET");
  assert.equal(pushPreflight.status,204,"Guest push configuration allowed by CORS");
  const open=await req("/v1/auth/challenge","OPTIONS",GUEST,"POST");
  assert.equal(open.status,204);
  assert.equal(open.headers.get("access-control-allow-origin"),GUEST);
  const guestInbox=await req("/v1/threads","GET",GUEST);
  assert.equal(guestInbox.status,401,"Guest cannot list messages without signing in");
  assert.equal(guestInbox.headers.get("access-control-allow-origin"),GUEST);
  // Prove a real, ephemeral public guest can complete the P-256 handshake
  // without receiving the owner's key, an invitation, or any chat history.
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const deviceId=await fingerprint(publicJwk);
  async function post(path,payload,token){
    const result=await fetch(BASE+path,{method:"POST",cache:"no-store",
      headers:{"Origin":GUEST,"Content-Type":"application/json",
        ...(token?{"Authorization":"Bearer "+token}:{})},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(16000)});
    const raw=await result.text();
    let value;
    try{value=JSON.parse(raw);}catch{value={error:raw};}
    return {status:result.status,value};
  }
  const challenge=await post("/v1/auth/challenge",{deviceId,publicJwk});
  assert.equal(challenge.status,200,"Guest challenge should be permitted");
  const proof={deviceId,publicJwk,challenge:challenge.value.challenge,
    audience:BASE,issuedAt:new Date().toISOString()};
  const signature=b64url(new Uint8Array(await crypto.subtle.sign(
    {name:"ECDSA",hash:"SHA-256"},pair.privateKey,proofBytes(proof))));
  const auth=await post("/v1/auth/verify",{...proof,signature});
  assert.equal(auth.status,200,"Guest signed-device login should be permitted");
  assert.equal(auth.value.deviceId,deviceId);
  const token=auth.value.token;
  const sessionReply=await fetch(BASE+"/v1/threads",{
    headers:{"Origin":GUEST,"Authorization":"Bearer "+token},
    cache:"no-store",signal:AbortSignal.timeout(16000)});
  assert.equal(sessionReply.status,200);
  assert.deepEqual((await sessionReply.json()).threads,[],"A new guest has no inherited conversations");
  const configReply=await fetch(BASE+"/v1/push/config",{
    headers:{"Origin":GUEST,"Authorization":"Bearer "+token},
    cache:"no-store",signal:AbortSignal.timeout(16000),
  });
  assert.equal(configReply.status,200,"Signed guest push config must exist");
  const pushConfig=await configReply.json();
  assert.equal(pushConfig.scope,"guest");
  assert.equal(typeof pushConfig.available,"boolean");
  assert.equal(typeof pushConfig.enabled,"boolean");
  assert.equal(pushConfig.enabled,false,"A newly signed anonymous device has no push subscription");
  if(pushConfig.available)
    assert.match(pushConfig.publicKey,/^[A-Za-z0-9_-]{80,100}$/);
  else assert.equal(pushConfig.publicKey,null);
  const unjoined=await post("/v1/push/subscribe",{subscription:{}},token);
  assert.equal(unjoined.status,pushConfig.available?403:503,
    "An uninvited device cannot register for notifications");
  const nonSigned=await req("/v1/push/config","GET",GUEST);
  assert.equal(nonSigned.status,401,"Push configuration requires signed authentication");
  const badPush=await req("/v1/push/config","GET","https://untrusted.example");
  assert.equal(badPush.status,403,"Untrusted origins cannot use push");
  const abuse=await post("/v1/invites",{keyId:"bogus-invalid-invite-id-12345"},token);
  assert.equal(abuse.status,403,"Signed guest still cannot issue owner invitations");
  const ownerOnly=await req("/v1/invites","OPTIONS",GUEST,"POST");
  assert.equal(ownerOnly.status,403,"Guest origin must not mint owner invitations");
  const AI=await req("/v1/reception/policy","OPTIONS",GUEST,"POST");
  assert.equal(AI.status,403,"Guest origin must not change owner AI settings");
  const ownerAccess=await req("/v1/invites","OPTIONS",OWNER,"POST");
  assert.equal(ownerAccess.status,204,"Owner invitation creation still available at owner origin");
  const stranger=await req("/v1/identity","GET","https://untrusted.example");
  assert.equal(stranger.status,403);
  console.log("LIVE public beta passed: public guest PWA, P-256 login, push route/worker and isolation verified; original owner preserved.");
}
await main();
