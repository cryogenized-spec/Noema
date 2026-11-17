import {test} from "node:test";
import assert from "node:assert/strict";
import {
  generateInviteSecret,generateInviteKeyId,importInviteSecret,
  encryptEnvelope,decryptEnvelope,contactSecretFromFragment,
} from "../src/lib/network/contact-cipher.ts";

const threadA="thread-a-1234567890";
const threadB="thread-b-1234567890";
const messageId="message-id-1234567890";

test("independent browser parties can decrypt using a shared invite key",async()=>{
  const secret=generateInviteSecret();
  const owner=await importInviteSecret(secret);
  const guest=await importInviteSecret(secret);
  assert.equal(owner.extractable,false);
  assert.equal(guest.extractable,false);
  assert.notEqual(generateInviteKeyId(),generateInviteKeyId());
  const ciphertext=await encryptEnvelope(guest,threadA,messageId,"Hello from guest 👋");
  assert.match(ciphertext,/^enc1\./);
  assert.ok(!ciphertext.includes("Hello"));
  assert.equal(await decryptEnvelope(owner,threadA,messageId,ciphertext),"Hello from guest 👋");
});
test("AAD binds each message to its thread and client-message ID",async()=>{
  const key=await importInviteSecret(generateInviteSecret());
  const ciphertext=await encryptEnvelope(key,threadA,messageId,"Sensitive guest question");
  await assert.rejects(decryptEnvelope(key,threadB,messageId,ciphertext));
  await assert.rejects(decryptEnvelope(key,threadA,"other-message-id-1234",ciphertext));
});
test("wrong invitation secret and altered ciphertext cannot authenticate",async()=>{
  const key=await importInviteSecret(generateInviteSecret());
  const other=await importInviteSecret(generateInviteSecret());
  const ciphertext=await encryptEnvelope(key,threadA,messageId,"Important meeting");
  await assert.rejects(decryptEnvelope(other,threadA,messageId,ciphertext));
  const altered=ciphertext.slice(0,-2)+(ciphertext.endsWith("AA")?"AB":"AA");
  await assert.rejects(decryptEnvelope(key,threadA,messageId,altered));
});
test("same plaintext uses fresh nonces and decrypts independently",async()=>{
  const key=await importInviteSecret(generateInviteSecret());
  const a=await encryptEnvelope(key,threadA,messageId,"Repeatable content");
  const b=await encryptEnvelope(key,threadA,messageId,"Repeatable content");
  assert.notEqual(a,b);
  assert.equal(await decryptEnvelope(key,threadA,messageId,a),"Repeatable content");
  assert.equal(await decryptEnvelope(key,threadA,messageId,b),"Repeatable content");
});
test("only the fragment's explicit 256-bit key is accepted",()=>{
  const secret=generateInviteSecret();
  assert.equal(contactSecretFromFragment("#k="+secret),secret);
  assert.equal(contactSecretFromFragment("#k=not-a-key"),"");
  assert.equal(contactSecretFromFragment(""),"");
});
