import assert from "node:assert/strict";

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
  const open=await req("/v1/auth/challenge","OPTIONS",GUEST,"POST");
  assert.equal(open.status,204);
  assert.equal(open.headers.get("access-control-allow-origin"),GUEST);
  const guestInbox=await req("/v1/threads","GET",GUEST);
  assert.equal(guestInbox.status,401,"Guest cannot list messages without signing in");
  assert.equal(guestInbox.headers.get("access-control-allow-origin"),GUEST);
  const ownerOnly=await req("/v1/invites","OPTIONS",GUEST,"POST");
  assert.equal(ownerOnly.status,403,"Guest origin must not mint owner invitations");
  const AI=await req("/v1/reception/policy","OPTIONS",GUEST,"POST");
  assert.equal(AI.status,403,"Guest origin must not change owner AI settings");
  const ownerAccess=await req("/v1/invites","OPTIONS",OWNER,"POST");
  assert.equal(ownerAccess.status,204,"Owner invitation creation still available at owner origin");
  const stranger=await req("/v1/identity","GET","https://untrusted.example");
  assert.equal(stranger.status,403);
  console.log("LIVE public beta passed: guest site public, signed guest surface restricted, existing owner preserved.");
}
await main();
