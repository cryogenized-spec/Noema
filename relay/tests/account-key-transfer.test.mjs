import {test} from "node:test";
import assert from "node:assert/strict";
import {AccountKeyTransfer} from "../src/account-key-transfer.mjs";
import {fingerprint,b64url} from "../src/protocol.mjs";
import {
  createRecipientOffer,sealAccountRootForRecipient,openAccountRootFromOwner,
} from "../../src/lib/identity/device-key-transfer.ts";

const accountId="account-abcdefghijklmnopqrstu";
const requestId="pair-abcdefghijklmnopqrstuv";
const mem=()=>{
  const data=new Map();
  const tx={get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},
    delete:async k=>{data.delete(k);}};
  return {data,...tx,transaction:async fn=>fn(tx)};
};
async function device(){
  const keys=await crypto.subtle.generateKey(
    {name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
  return {deviceId:await fingerprint(publicJwk),publicJwk,
    sign:bytes=>crypto.subtle.sign(
      {name:"ECDSA",hash:"SHA-256"},keys.privateKey,bytes)};
}
async function setup(){
  const storage=mem(),owner=await device(),candidate=await device(),
    stranger=await device();
  const approvedAt=new Date().toISOString();
  storage.data.set("accounts:pair:"+requestId,{
    id:requestId,accountId,candidateDeviceId:candidate.deviceId,
    ownerDeviceId:owner.deviceId,status:"approved",
  });
  for(const [d,role] of [[owner,"owner"],[candidate,"member"]])
    storage.data.set("accounts:member:"+accountId+":"+d.deviceId,{
      accountId,deviceId:d.deviceId,role,status:"active",approvedAt,
    });
  const getDeviceKey=async id=>[owner,candidate,stranger]
    .find(x=>x.deviceId===id)?.publicJwk;
  const transfer=new AccountKeyTransfer(storage,getDeviceKey);
  const call=async(sender,action,body,method="POST")=>{
    const response=await transfer.route(
      new Request("https://noema.example/v1/accounts/"+accountId+
        "/key-transfers/"+requestId+"/"+action,{method}),
      {deviceId:sender.deviceId},accountId,requestId,action,body);
    return {status:response.status,data:await response.json()};
  };
  return {storage,owner,candidate,stranger,call};
}
test("only signed approved candidate and owner exchange one-time encrypted root",async()=>{
  const {storage,owner,candidate,stranger,call}=await setup();
  const {offer,privateKey}=await createRecipientOffer(
    accountId,requestId,candidate.deviceId,candidate.sign);
  assert.equal((await call(owner,"offer",{offer})).status,403);
  assert.equal((await call(stranger,"offer",{offer})).status,403);
  assert.equal((await call(candidate,"offer",{offer:{...offer,signature:"A".repeat(86)}})).status,403);
  assert.equal((await call(candidate,"offer",{offer:{...offer,plaintext:"bad"}})).status,400);
  assert.equal((await call(candidate,"offer",{offer})).status,201);
  assert.equal((await call(candidate,"offer",{offer})).status,409);
  assert.equal((await call(stranger,"offer",undefined,"GET")).status,403);
  const fetched=await call(owner,"offer",undefined,"GET");
  assert.equal(fetched.status,200);
  const root=crypto.getRandomValues(new Uint8Array(32));
  const pkg=await sealAccountRootForRecipient(
    root,fetched.data.offer,fetched.data.candidateSigningKey,
    owner.deviceId,owner.sign);
  assert.equal((await call(candidate,"package",{package:pkg})).status,403);
  assert.equal((await call(owner,"package",{package:{...pkg,plaintext:"do not store"}})).status,400);
  assert.equal((await call(owner,"package",{package:{...pkg,signature:"A".repeat(86)}})).status,403);
  assert.equal((await call(owner,"package",{package:pkg})).status,201);
  assert.equal((await call(owner,"package",{package:pkg})).status,409);
  assert.equal((await call(owner,"claim",{})).status,403);
  assert.equal((await call(stranger,"claim",{})).status,403);
  const claimed=await call(candidate,"claim",{});
  assert.equal(claimed.status,200);
  const recovered=await openAccountRootFromOwner(
    claimed.data.package,offer,privateKey,claimed.data.ownerSigningKey,
    {accountId,requestId,ownerDeviceId:owner.deviceId,
      recipientDeviceId:candidate.deviceId});
  assert.equal(recovered.extractable,false);
  assert.equal((await call(candidate,"claim",{})).status,410);
  const values=[...storage.data.values()].map(v=>JSON.stringify(v)).join("\n");
  assert.ok(!values.includes(b64url(root)),"Raw account key never reaches relay storage");
  assert.ok(!values.includes("do not store"));
  assert.equal(storage.data.has("accounts:key-package:"+accountId+":"+requestId),false);
});
test("revoked candidate and expired approval never get key material",async()=>{
  const {storage,owner,candidate,call}=await setup();
  const {offer}=await createRecipientOffer(
    accountId,requestId,candidate.deviceId,candidate.sign);
  assert.equal((await call(candidate,"offer",{offer})).status,201);
  const pkg=await sealAccountRootForRecipient(
    crypto.getRandomValues(new Uint8Array(32)),offer,candidate.publicJwk,
    owner.deviceId,owner.sign);
  assert.equal((await call(owner,"package",{package:pkg})).status,201);
  const memberKey="accounts:member:"+accountId+":"+candidate.deviceId;
  storage.data.set(memberKey,{...storage.data.get(memberKey),status:"revoked"});
  assert.equal((await call(candidate,"claim",{})).status,404);
});
test("key transfer eligibility is a short window after an approved pairing",async()=>{
  const {storage,owner,candidate,call}=await setup();
  const membershipKey="accounts:member:"+accountId+":"+candidate.deviceId;
  storage.data.set(membershipKey,{...storage.data.get(membershipKey),
    approvedAt:new Date(Date.now()-11*60_000).toISOString()});
  const {offer}=await createRecipientOffer(
    accountId,requestId,candidate.deviceId,candidate.sign);
  assert.equal((await call(candidate,"offer",{offer})).status,404);
  assert.equal((await call(owner,"offer",undefined,"GET")).status,404);
});
