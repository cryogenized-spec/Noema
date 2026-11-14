import { test } from "node:test";
import assert from "node:assert/strict";
import { NoemaRelayRoom } from "../src/index.mjs";
import { fingerprint, b64url, proofBytes } from "../src/protocol.mjs";

function memoryStore() {
  const data = new Map();
  return {
    get: async (key) => data.get(key),
    put: async (key, value) => { data.set(key, value); },
    delete: async (key) => { data.delete(key); },
    list: async ({prefix}) => new Map([...data].filter(([key]) => key.startsWith(prefix))),
    transaction: async (callback) => callback({
      get: async (key) => data.get(key),
      put: async (key, value) => { data.set(key,value); },
      delete: async (key) => { data.delete(key); },
    }),
  };
}
const ROOT = "https://relay.example";
function request(path, data, bearer, method = "POST") {
  return new Request(ROOT + path, {
    method, headers: {
      "Content-Type":"application/json",
      "CF-Connecting-IP":"127.0.0.1",
      ...(bearer ? { Authorization:"Bearer " + bearer } : {}),
    },
    ...(method !== "GET" ? { body:JSON.stringify(data) } : {}),
  });
}
async function call(room, path, data = {}, bearer, method = "POST") {
  const response = await room.fetch(request(path,data,bearer,method));
  return { status:response.status, json:await response.json() };
}
async function register(room) {
  const keys = await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk",keys.publicKey);
  const deviceId = await fingerprint(publicJwk);
  const challenge = await call(room,"/v1/auth/challenge",{deviceId,publicJwk});
  assert.equal(challenge.status,200);
  const proof = {deviceId,publicJwk,challenge:challenge.json.challenge,
    audience:ROOT,issuedAt:new Date().toISOString()};
  const signed = await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
    keys.privateKey,proofBytes(proof));
  const verification = await call(room,"/v1/auth/verify",
    {...proof,signature:b64url(new Uint8Array(signed))});
  assert.equal(verification.status,200);
  return {token:verification.json.token,deviceId,proof,
    signature:b64url(new Uint8Array(signed))};
}
test("invite is single-use, sessions are signed, messages are idempotent and scoped", async () => {
  const room = new NoemaRelayRoom({storage:memoryStore()}, {});
  const owner = await register(room), guest = await register(room), stranger = await register(room);
  const replay = await call(room,"/v1/auth/verify",{...owner.proof,signature:owner.signature});
  assert.equal(replay.status,401);
  const invite = await call(room,"/v1/invites",{alias:"Moss Lantern"},owner.token);
  assert.equal(invite.status,201);
  const redemption = await call(room,"/v1/invites/redeem",
    {token:invite.json.token,alias:"Quiet Finch"},guest.token);
  assert.equal(redemption.status,201);
  const thread = redemption.json.thread;
  assert.equal(thread.receptionEnabled,false);
  assert.equal((await call(room,"/v1/invites/redeem",
    {token:invite.json.token},stranger.token)).status,410);
  assert.equal((await call(room,"/v1/threads/"+thread.id,{},stranger.token,"GET")).status,404);
  const msg = {clientMessageId:"unique-client-msg-123456",content:"Hello"};
  const sent = await call(room,"/v1/threads/"+thread.id+"/messages",msg,guest.token);
  assert.equal(sent.status,201);
  assert.equal(sent.json.message.status,"stored");
  const duplicate = await call(room,"/v1/threads/"+thread.id+"/messages",msg,guest.token);
  assert.equal(duplicate.json.message.seq,sent.json.message.seq);
  const inbox = await call(room,"/v1/threads/"+thread.id+"/messages?after=0",{},owner.token,"GET");
  assert.equal(inbox.json.messages.length,1);
  assert.equal(inbox.json.messages[0].sender,"guest");
  assert.equal((await call(room,"/v1/threads/"+thread.id+"/agent-claim",
    {seq:1},owner.token)).status,403);
  assert.equal((await call(room,"/v1/threads/"+thread.id+"/reception",
    {enabled:true},guest.token)).status,403);
  assert.equal((await call(room,"/v1/threads/"+thread.id+"/reception",
    {enabled:true},owner.token)).status,200);
  assert.equal((await call(room,"/v1/threads/"+thread.id+"/agent-claim",
    {seq:1},guest.token)).status,403);
  const claim = await call(room,"/v1/threads/"+thread.id+"/agent-claim",
    {seq:1},owner.token);
  assert.equal(claim.status,200);
  assert.equal((await call(room,"/v1/threads/"+thread.id+"/agent-claim",
    {seq:1},owner.token)).status,429);
});
