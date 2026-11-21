import {test} from "node:test";
import assert from "node:assert/strict";
import {
  createRecipientOffer,verifyRecipientOffer,transferOfferHash,
  sealAccountRootForRecipient,openAccountRootFromOwner,
} from "../src/lib/identity/device-key-transfer.ts";

const utf8=new TextEncoder();
const accountId="account-abcdefghijklmnopqrst",requestId="pair-request-abcdefghijklmnop";
const b64url=(bytes)=>Buffer.from(bytes).toString("base64url");
async function device(){
  const pair=await crypto.subtle.generateKey(
    {name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const digest=await crypto.subtle.digest("SHA-256",utf8.encode(
    JSON.stringify(["NOEMA_DEVICE_V1",publicJwk.x,publicJwk.y])));
  return {
    id:b64url(new Uint8Array(digest)),publicJwk,
    sign:(data)=>crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
      pair.privateKey,data),
  };
}
const recipient=(deviceId)=>({accountId,requestId,deviceId});
const source=(ownerId,recipientId)=>({
  accountId,requestId,ownerDeviceId:ownerId,recipientDeviceId:recipientId,
});
async function deriveTestKey(root){
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",
    salt:utf8.encode("NOEMA_TRANSFER_TEST"),
    info:utf8.encode(accountId),
  },root,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
test("two independently signed devices transfer a new seed without exposing its plaintext",async()=>{
  const owner=await device(),candidate=await device();
  const {offer,privateKey}=await createRecipientOffer(
    accountId,requestId,candidate.id,candidate.sign);
  assert.equal(privateKey.extractable,false);
  assert.notEqual(offer.publicJwk.d,"anything");
  await verifyRecipientOffer(offer,candidate.publicJwk,recipient(candidate.id));
  const root=crypto.getRandomValues(new Uint8Array(32));
  const pkg=await sealAccountRootForRecipient(
    root,offer,candidate.publicJwk,owner.id,owner.sign);
  assert.equal(pkg.ownerDeviceId,owner.id);
  assert.equal(pkg.recipientDeviceId,candidate.id);
  assert.equal(pkg.offerHash,await transferOfferHash(offer));
  assert.ok(!JSON.stringify(pkg).includes(b64url(root)),
    "The relay package must not contain the raw seed");
  assert.ok(!("d" in pkg.ephemeralPublicJwk),
    "ECDH private key must never be in the envelope");
  const received=await openAccountRootFromOwner(
    pkg,offer,privateKey,owner.publicJwk,source(owner.id,candidate.id));
  assert.equal(received.extractable,false);
  await assert.rejects(crypto.subtle.exportKey("raw",received));
  const localRoot=await crypto.subtle.importKey("raw",root,"HKDF",false,["deriveKey"]);
  const first=await deriveTestKey(localRoot),second=await deriveTestKey(received);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt(
    {name:"AES-GCM",iv},first,utf8.encode("verified second device"));
  const opened=await crypto.subtle.decrypt({name:"AES-GCM",iv},second,encrypted);
  assert.equal(new TextDecoder().decode(opened),"verified second device");
});
test("wrong recipient, owner, account, pairing request or ECDH key cannot decrypt",async()=>{
  const owner=await device(),otherOwner=await device(),candidate=await device(),wrong=await device();
  const {offer,privateKey}=await createRecipientOffer(
    accountId,requestId,candidate.id,candidate.sign);
  const pkg=await sealAccountRootForRecipient(
    crypto.getRandomValues(new Uint8Array(32)),offer,candidate.publicJwk,
    owner.id,owner.sign);
  const required=source(owner.id,candidate.id);
  await assert.rejects(openAccountRootFromOwner(pkg,offer,privateKey,
    otherOwner.publicJwk,{...required,ownerDeviceId:otherOwner.id}));
  await assert.rejects(openAccountRootFromOwner(pkg,offer,privateKey,
    owner.publicJwk,{...required,accountId:"account-someone-else-123"}));
  await assert.rejects(openAccountRootFromOwner(pkg,offer,privateKey,
    owner.publicJwk,{...required,requestId:"pair-request-different-123"}));
  await assert.rejects(openAccountRootFromOwner(pkg,offer,privateKey,
    owner.publicJwk,{...required,recipientDeviceId:wrong.id}));
  const wrongKey=await crypto.subtle.generateKey(
    {name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
  await assert.rejects(openAccountRootFromOwner(pkg,offer,wrongKey.privateKey,
    owner.publicJwk,required));
});
test("tampering, forged offer signatures and expiry are refused",async()=>{
  const owner=await device(),candidate=await device(),other=await device();
  const {offer,privateKey}=await createRecipientOffer(
    accountId,requestId,candidate.id,candidate.sign);
  const root=crypto.getRandomValues(new Uint8Array(32));
  const pkg=await sealAccountRootForRecipient(
    root,offer,candidate.publicJwk,owner.id,owner.sign);
  const required=source(owner.id,candidate.id);
  await assert.rejects(verifyRecipientOffer(offer,other.publicJwk,recipient(candidate.id)));
  await assert.rejects(verifyRecipientOffer(
    {...offer,publicJwk:{...offer.publicJwk,x:other.publicJwk.x}},
    candidate.publicJwk,recipient(candidate.id)));
  await assert.rejects(openAccountRootFromOwner(
    {...pkg,ciphertext:pkg.ciphertext.slice(0,-2)+"AA"},offer,privateKey,
    owner.publicJwk,required));
  await assert.rejects(openAccountRootFromOwner(
    {...pkg,nonce:"A".repeat(16)},offer,privateKey,owner.publicJwk,required));
  await assert.rejects(openAccountRootFromOwner(pkg,offer,privateKey,
    owner.publicJwk,required,Date.parse(pkg.expiresAt)+1));
  await assert.rejects(sealAccountRootForRecipient(
    root,offer,candidate.publicJwk,owner.id,owner.sign,
    Date.parse(offer.expiresAt)+1));
  await assert.rejects(sealAccountRootForRecipient(
    crypto.getRandomValues(new Uint8Array(16)),offer,candidate.publicJwk,
    owner.id,owner.sign));
});
