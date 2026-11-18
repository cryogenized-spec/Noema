import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyBrowserOrigin,allowedGuestRoute} from "../src/guest-origin.mjs";
const owner="https://noema-contact-staging.vercel.app";
const guest="https://noema-guest.vercel.app";
const id="ABC123def456789_xyz";
test("public and protected origins are separated exactly",()=>{
  assert.equal(classifyBrowserOrigin(owner,owner,guest),"owner");
  assert.equal(classifyBrowserOrigin(guest,owner,guest),"guest");
  assert.equal(classifyBrowserOrigin(null,owner,guest),"server");
  assert.equal(classifyBrowserOrigin("https://noema-guest.vercel.app.evil.test",owner,guest),null);
  assert.equal(classifyBrowserOrigin("https://untrusted.example",owner,guest),null);
  assert.equal(classifyBrowserOrigin(guest,owner,""),null);
});
test("guest origin can only authenticate, redeem and read/write its own messages",()=>{
  for(const [method,path] of [
    ["POST","/v1/auth/challenge"],["POST","/v1/auth/verify"],
    ["POST","/v1/invites/redeem"],["GET","/v1/threads"],
    ["GET","/v1/identity"],["GET","/v1/threads/"+id],
    ["GET","/v1/threads/"+id+"/messages"],["POST","/v1/threads/"+id+"/messages"],
  ])assert.equal(allowedGuestRoute(method,path),true,method+" "+path);
  for(const [method,path] of [
    ["POST","/v1/invites"],["POST","/v1/invites/revoke"],
    ["GET","/v1/reception/policy"],["POST","/v1/reception/policy"],
    ["GET","/v1/reception/pending"],["POST","/v1/threads/"+id+"/reception"],
    ["POST","/v1/threads/"+id+"/agent-claim"],["DELETE","/v1/threads/"+id+"/messages"],
    ["GET","/v1/accounts"],["GET","/v1/threads/"+id+"/anything"],
  ])assert.equal(allowedGuestRoute(method,path),false,method+" "+path);
});
