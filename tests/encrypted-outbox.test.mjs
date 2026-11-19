import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  outboxKey,validOutboxRecord,permanentDeliveryFailure,
} from "../guest-public/outbox.mjs";
import {
  generateInviteSecret,importInviteSecret,encryptEnvelope,decryptEnvelope,
} from "../src/lib/network/contact-cipher.ts";
import {seal,open} from "../guest-public/crypto.mjs";

const file=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const device="device-identity-12345678909876543210";
const thread="conversation-12345678901234567890";
const keyId="contact-key-12345678901234567890";
const msgId="message-12345678901234567890";
test("guest outbox stores a self-contained encrypted message, not plaintext",async()=>{
  const secret=generateInviteSecret();
  const ownerKey=await importInviteSecret(secret);
  const guestKey=await import("../guest-public/crypto.mjs").then(m=>m.importSecret(secret));
  const plaintext="Keep this message private 📨";
  const ciphertext=await encryptEnvelope(ownerKey,thread,msgId,plaintext);
  const item={
    id:outboxKey(device,thread,msgId),deviceId:device,threadId:thread,
    keyId,clientMessageId:msgId,ciphertext,createdAt:new Date().toISOString(),
  };
  assert.equal(validOutboxRecord(item),true);
  const durable=JSON.stringify(item);
  assert.ok(!durable.includes(plaintext),"IndexedDB record must not contain plaintext");
  assert.ok(!durable.includes(secret),"IndexedDB record must not contain invite root");
  // Reloaded record retains its exact ciphertext and client ID. The relay
  // deduplicates retries by this ID and rejects any ciphertext substitution.
  const restored=JSON.parse(durable);
  assert.equal(restored.clientMessageId,msgId);
  assert.equal(restored.ciphertext,ciphertext);
  assert.equal(await decryptEnvelope(ownerKey,thread,msgId,restored.ciphertext),plaintext);
  assert.equal(await open(guestKey,thread,msgId,restored.ciphertext),plaintext);
  const guestCiphertext=await seal(guestKey,thread,msgId,plaintext);
  assert.equal(await decryptEnvelope(ownerKey,thread,msgId,guestCiphertext),plaintext);
});
test("outbox rejects metadata that could accidentally persist message text or credentials",async()=>{
  const key=await importInviteSecret(generateInviteSecret());
  const cipher=await encryptEnvelope(key,thread,msgId,"A queued item");
  const valid={id:outboxKey(device,thread,msgId),deviceId:device,threadId:thread,
    keyId,clientMessageId:msgId,ciphertext:cipher,createdAt:"2026-11-19T18:00:00.000Z"};
  assert.equal(validOutboxRecord(valid),true);
  for(const extra of [{text:"unprotected"},{draft:"unprotected"},{token:"secret"},
    {secret:"key"},{plaintext:"unprotected"},{blocked:"true"}])
    assert.equal(validOutboxRecord({...valid,...extra}),false,JSON.stringify(extra));
  assert.equal(validOutboxRecord({...valid,deviceId:"different-device",id:valid.id}),false);
  assert.equal(validOutboxRecord({...valid,ciphertext:"hello, world"}),false);
  assert.equal(validOutboxRecord({...valid,clientMessageId:"wrong"}),false);
  assert.equal(validOutboxRecord({...valid,id:"other"}),false);
  assert.equal(validOutboxRecord({...valid,createdAt:"bad date"}),false);
  assert.equal(validOutboxRecord({...valid,blocked:true}),true);
});
test("permanent failure needs explicit retry; network failures remain queued",()=>{
  for(const code of [400,403,404,409,410,422])
    assert.equal(permanentDeliveryFailure(code),true);
  for(const code of [0,401,408,429,500,503,504])
    assert.equal(permanentDeliveryFailure(code),false);
});
test("both apps commit ciphertext before sending, and expose recovery actions",()=>{
  const owner=file("src/components/network/secure-contact.tsx");
  const guest=file("guest-public/app.js");
  const ownerStore=file("src/lib/network/contact-outbox.ts");
  const db=file("src/lib/db/client.ts");
  assert.match(db,/this\.version\(14\)\.stores\(\{ contactOutbox:/);
  assert.ok(owner.indexOf("await persistContactOutbox(item)")<
    owner.indexOf("const result=await deliverContactOutbox(session,item)"));
  assert.ok(guest.indexOf("await saveQueue(item)")<
    guest.indexOf("const result=await deliverQueued(item)"));
  assert.match(owner,/Load older messages/);
  assert.match(owner,/Retry queued message/);
  assert.match(owner,/Discard queued message/);
  assert.match(guest,/queued\.filter\(x=>x\.threadId===selected\)/);
  assert.match(guest,/await restoreCachedThreads\(\)/);
  assert.match(guest,/await flushQueue\(\)/);
  assert.match(guest,/if\(!session\)await authenticate\(\)/);
  assert.match(ownerStore,/await relayPostMessage\(session,item\.threadId,item\.ciphertext,item\.clientMessageId\)/);
  assert.doesNotMatch(ownerStore,/localStorage\.setItem\(/);
  assert.doesNotMatch(guest,/sessionStorage\.setItem\(.+outbox/);
});
