import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeIdentityDraft,validHandle,hasAccountPermission,canApprovePairing}
  from "../src/lib/identity/account-policy.ts";

const now="2026-11-18T00:00:00.000Z";
const owner={accountId:"account-1",deviceId:"device-A",role:"owner",status:"active",approvedAt:now};
const member={accountId:"account-1",deviceId:"device-B",role:"member",status:"active",approvedAt:now};
const pending={accountId:"account-1",deviceId:"device-C",role:"member",status:"pending",approvedAt:null};
test("registration form values are local drafts, normalized and bounded",()=>{
 const a=normalizeIdentityDraft({displayName:"  Test    Maker ",deviceLabel:"  Pixel   Phone ",handle:"@sample_name",intent:"independent"});
 assert.equal(a.id,"self");
 assert.equal(a.displayName,"Test Maker");
 assert.equal(a.deviceLabel,"Pixel Phone");
 assert.equal(a.handle,"sample_name");
 assert.equal(a.intent,"independent");
 assert.equal(normalizeIdentityDraft({handle:"@@not valid! ",intent:"join-existing"}).handle,"");
 assert.equal(normalizeIdentityDraft({intent:"unsupported"}).intent,"independent");
 assert.equal(validHandle("abcdefghijklmnopqrstuvwx"),true);
 assert.equal(validHandle("1bad"),false);
 assert.equal(validHandle("contains-dash"),false);
});
test("only a signed active member in the correct account can message",()=>{
 assert.equal(hasAccountPermission(owner,"device-A","account-1","message"),true);
 assert.equal(hasAccountPermission(member,"device-B","account-1","message"),true);
 assert.equal(hasAccountPermission(member,"device-A","account-1","message"),false);
 assert.equal(hasAccountPermission(member,"device-B","account-2","message"),false);
 assert.equal(hasAccountPermission(pending,"device-C","account-1","message"),false);
 assert.equal(hasAccountPermission({...member,status:"revoked"},"device-B","account-1","message"),false);
 assert.equal(hasAccountPermission({...member,approvedAt:null},"device-B","account-1","message"),false);
});
test("account ownership cannot be granted by display names or pending pairing links",()=>{
 assert.equal(hasAccountPermission(owner,"device-A","account-1","pair"),true);
 assert.equal(hasAccountPermission(owner,"device-A","account-1","revoke"),true);
 assert.equal(hasAccountPermission(owner,"device-A","account-1","manage-agents"),true);
 assert.equal(hasAccountPermission(member,"device-B","account-1","pair"),false);
 assert.equal(hasAccountPermission(pending,"device-C","account-1","pair"),false);
 assert.equal(canApprovePairing(owner,"device-A",pending),true);
 assert.equal(canApprovePairing(member,"device-B",pending),false);
 assert.equal(canApprovePairing(owner,"device-A",{...pending,deviceId:"device-A"}),false);
 assert.equal(canApprovePairing(owner,"device-A",{...pending,role:"owner"}),false);
 assert.equal(canApprovePairing(owner,"device-A",{...pending,accountId:"account-2"}),false);
 assert.equal(canApprovePairing(owner,"device-A",{...pending,status:"active"}),false);
});
