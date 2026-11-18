import { test } from "node:test";
import assert from "node:assert/strict";
import { NoemaRelayRoom } from "../relay/src/index.mjs";
import { fingerprint, b64url, proofBytes } from "../relay/src/protocol.mjs";
import {
  generateInviteSecret, generateInviteKeyId, importInviteSecret,
  encryptEnvelope, decryptEnvelope,
} from "../src/lib/network/contact-cipher.ts";

const ORIGIN = "https://relay.noema.test";
function memoryStorage() {
  const data = new Map();
  const txn = {
    get: async key => data.get(key),
    put: async (key, value) => { data.set(key, value); },
    delete: async key => { data.delete(key); },
  };
  return {
    data,
    ...txn,
    list: async ({prefix}) => new Map([...data].filter(([key]) => key.startsWith(prefix))),
    transaction: async callback => callback(txn),
  };
}
async function send(room,path,token="",body,method="POST") {
  const response=await room.fetch(new Request(ORIGIN+path,{
    method,
    headers:{
      "Content-Type":"application/json",
      "CF-Connecting-IP":"198.51.100.41",
      ...(token ? {"Authorization":"Bearer "+token}:{}),
    },
    ...(method==="GET"?{}:{body:JSON.stringify(body)}),
  }));
  return { status:response.status, data:await response.json() };
}
async function signedDevice(room){
  const keyPair=await crypto.subtle.generateKey(
    {name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",keyPair.publicKey);
  const id=await fingerprint(jwk);
  const challenge=await send(room,"/v1/auth/challenge","",{deviceId:id,publicJwk:jwk});
  assert.equal(challenge.status,200);
  const proof={deviceId:id,publicJwk:jwk,challenge:challenge.data.challenge,
    audience:ORIGIN,issuedAt:new Date().toISOString()};
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
    keyPair.privateKey,proofBytes(proof));
  const verified=await send(room,"/v1/auth/verify","",
    {...proof,signature:b64url(new Uint8Array(sig))});
  assert.equal(verified.status,200);
  return {id,token:verified.data.token};
}

test("two signed devices: single-use invitation, guest-to-owner ciphertext, reply, and reconnect",async()=>{
  const env={OWNER_DEVICE_ID:"staging-owner-not-yet-signed-in"};
  const storage=memoryStorage();
  const room=new NoemaRelayRoom({storage},env);
  const owner=await signedDevice(room);
  env.OWNER_DEVICE_ID=owner.id;
  const guest=await signedDevice(room);
  const anonymous=await send(room,"/v1/threads","",undefined,"GET");
  assert.equal(anonymous.status,401);

  // Owner key is generated locally. Only keyId goes to the relay.
  const secret=generateInviteSecret();
  const keyId=generateInviteKeyId();
  const ownerKey=await importInviteSecret(secret);
  const invited=await send(room,"/v1/invites",owner.token,
    {alias:"Test owner",keyId});
  assert.equal(invited.status,201);
  assert.equal("secret" in invited.data,false);
  const consumed=await send(room,"/v1/invites/redeem",guest.token,
    {token:invited.data.token,alias:"Test guest"});
  assert.equal(consumed.status,201);
  const id=consumed.data.thread.id;
  assert.equal(consumed.data.thread.keyId,keyId);
  const replay=await send(room,"/v1/invites/redeem",guest.token,
    {token:invited.data.token,alias:"Second guest"});
  assert.equal(replay.status,410);

  // Owner can enumerate contacts before the guest's first message.
  const firstInbox=await send(room,"/v1/threads",owner.token,undefined,"GET");
  assert.equal(firstInbox.data.threads.length,1);
  assert.equal(firstInbox.data.threads[0].guestAlias,"Test guest");
  assert.equal(firstInbox.data.threads[0].receptionEnabled,false);

  const guestKey=await importInviteSecret(secret);
  const messageId="guest-message-001";
  const plaintext="Hello owner, I'm testing NOEMA 📱";
  const sealed=await encryptEnvelope(guestKey,id,messageId,plaintext);
  assert.ok(!sealed.includes("Hello owner"));
  const sent=await send(room,"/v1/threads/"+id+"/messages",guest.token,
    {clientMessageId:messageId,content:sealed});
  assert.equal(sent.status,201);
  assert.equal(sent.data.message.status,"stored");
  const repeated=await send(room,"/v1/threads/"+id+"/messages",guest.token,
    {clientMessageId:messageId,content:sealed});
  assert.equal(repeated.data.message.seq,sent.data.message.seq);

  const ownerInbox=await send(room,"/v1/threads",owner.token,undefined,"GET");
  assert.equal(ownerInbox.data.threads[0].nextSeq,1);
  const incoming=await send(room,"/v1/threads/"+id+"/messages",owner.token,undefined,"GET");
  assert.equal(incoming.status,200);
  assert.equal(incoming.data.messages.length,1);
  assert.equal(await decryptEnvelope(ownerKey,id,messageId,
    incoming.data.messages[0].content),plaintext);

  const answerId="owner-reply-001";
  const reply="I can read your encrypted message.";
  const answer=await encryptEnvelope(ownerKey,id,answerId,reply);
  const posted=await send(room,"/v1/threads/"+id+"/messages",owner.token,
    {clientMessageId:answerId,content:answer});
  assert.equal(posted.status,201);
  const guestInbox=await send(room,"/v1/threads/"+id+"/messages",guest.token,undefined,"GET");
  assert.equal(guestInbox.data.messages.length,2);
  assert.equal(await decryptEnvelope(guestKey,id,answerId,
    guestInbox.data.messages[1].content),reply);

  // A new browser session with the same stored encryption root can reopen history.
  const restored=await importInviteSecret(secret);
  assert.equal(await decryptEnvelope(restored,id,messageId,
    incoming.data.messages[0].content),plaintext);
  await assert.rejects(decryptEnvelope(restored,id,"wrong-message-id",
    incoming.data.messages[0].content));

  // The relay never stored a copy of the unencrypted message or shared secret.
  for(const [key,value] of storage.data.entries()){
    const serialised=JSON.stringify([key,value]);
    assert.ok(!serialised.includes(plaintext));
    assert.ok(!serialised.includes(secret));
  }
});
