import { test } from "node:test";
import assert from "node:assert/strict";
import { NoemaRelayRoom } from "../src/index.mjs";
import { fingerprint, b64url, proofBytes } from "../src/protocol.mjs";

function memoryStore() {
  const data = new Map();
  return {
    data,
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

test("a billed source message can never trigger a second paid request", async () => {
  const storage = memoryStore();
  const room = new NoemaRelayRoom({storage}, {});
  const owner = await register(room), guest = await register(room);
  const invite = await call(room,"/v1/invites",{alias:"Owner"},owner.token);
  const redeemed = await call(room,"/v1/invites/redeem",
    {token:invite.json.token,alias:"Visitor"},guest.token);
  const id = redeemed.json.thread.id;
  await call(room,"/v1/threads/"+id+"/messages",
    {clientMessageId:"guest-message-00000001",content:"Hello"},guest.token);
  await call(room,"/v1/threads/"+id+"/reception",{enabled:true},owner.token);
  const claim = await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token);
  assert.equal(claim.status,200);

  let billed = 0;
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      billed++;
      return new Response("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\n" +
        "data: {\"type\":\"response.completed\"}\n\n", {
        status:200, headers:{"Content-Type":"text/event-stream"},
      });
    };
    const payload = {seq:1,claimToken:claim.json.claimToken,apiKey:"TEST_FAKE_KEY_DO_NOT_USE"};
    assert.equal((await room.fetch(request("/v1/threads/"+id+"/agent-response",
      payload,owner.token))).status,200);
    const repeated = await call(room,"/v1/threads/"+id+"/agent-response",payload,owner.token);
    assert.equal(repeated.status,401);
    assert.equal((await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token)).status,429);
    assert.equal(billed,1);
    const pending = await call(room,"/v1/reception/pending",{},owner.token,"GET");
    assert.equal(pending.status,200);
    assert.equal(pending.json.pending.length,0);
  } finally { globalThis.fetch = oldFetch; }
});
test("expired unbilled leases can be reclaimed but consumed ones cannot", async () => {
  const storage = memoryStore();
  const room = new NoemaRelayRoom({storage}, {});
  const owner = await register(room), guest = await register(room);
  const invite = await call(room,"/v1/invites",{},owner.token);
  const join = await call(room,"/v1/invites/redeem",{token:invite.json.token},guest.token);
  const id = join.json.thread.id;
  await call(room,"/v1/threads/"+id+"/messages",
    {clientMessageId:"visitor-message-00000001",content:"Question"},guest.token);
  await call(room,"/v1/threads/"+id+"/reception",{enabled:true},owner.token);
  const initial = await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token);
  assert.equal(initial.status,200);
  const leaseKey = "claim:" + id + ":1";
  const lease = storage.data.get(leaseKey);
  storage.data.set(leaseKey, { ...lease, expiresAt:Date.now() - 1000 });
  const renewed = await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token);
  assert.equal(renewed.status,200);
  assert.notEqual(initial.json.claimToken,renewed.json.claimToken);
});
test("allowed browser origins receive CORS headers even on malformed input", async () => {
  const room = new NoemaRelayRoom({storage:memoryStore()}, {});
  const entry = (await import("../src/index.mjs")).default;
  const req = new Request(ROOT+"/v1/auth/challenge", {
    method:"POST", headers:{Origin:"https://noema.example",
      "Content-Type":"application/json"}, body:"{",
  });
  const env = {
    APP_ORIGIN:"https://noema.example",
    NOEMA_ROOM:{ idFromName:()=> "pilot", get:()=> ({fetch:(request)=>room.fetch(request)}) },
  };
  const res = await entry.fetch(req,env);
  assert.equal(res.status,400);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"),"https://noema.example");
});

test("reception claims include original question despite 60 newer messages", async () => {
  const storage = memoryStore(), room = new NoemaRelayRoom({storage}, {});
  const owner = await register(room), guest = await register(room);
  const invite = await call(room,"/v1/invites",{},owner.token);
  const joined = await call(room,"/v1/invites/redeem",{token:invite.json.token},guest.token);
  const id = joined.json.thread.id;
  await call(room,"/v1/threads/"+id+"/messages",
    {clientMessageId:"original-question-id",content:"What are your business hours?"},guest.token);
  await call(room,"/v1/threads/"+id+"/reception",{enabled:true},owner.token);
  const claim = await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token);
  assert.equal(claim.status,200);
  for (let i=0;i<60;i++) {
    const result = await call(room,"/v1/threads/"+id+"/messages",
      {clientMessageId:"later-message-id-"+i,content:"Message "+i},guest.token);
    assert.equal(result.status,201);
  }
  const oldFetch = globalThis.fetch;
  let seen = null;
  try {
    globalThis.fetch = async (_url, init) => {
      seen = JSON.parse(init.body);
      return new Response("data: {\"type\":\"response.completed\"}\n\n",{
        headers:{"Content-Type":"text/event-stream"}});
    };
    const result = await room.fetch(request("/v1/threads/"+id+"/agent-response",{
      seq:1,claimToken:claim.json.claimToken,apiKey:"TEST_FAKE_KEY_DO_NOT_USE",
    },owner.token));
    assert.equal(result.status,200);
    assert.equal(seen.input.at(-1).content,"What are your business hours?");
    assert.equal(seen.input.some(x=>x.content.includes("Message 59")),false);
    assert.equal(storage.data.get("claim:"+id+":1").state,"consumed");
  } finally { globalThis.fetch = oldFetch; }
});
test("reception scan rotates past the first 20 enabled owner threads", async () => {
  const storage=memoryStore(), room=new NoemaRelayRoom({storage},{});
  const owner=await register(room);
  for (let i=0;i<21;i++) {
    const id="test-thread-"+String(i).padStart(10,"0");
    storage.data.set("thread:"+id,{id,owner:owner.deviceId,guest:"unrelated-guest",
      ownerAlias:"Host",guestAlias:"Visitor",receptionEnabled:true,
      nextSeq:1,updatedAt:new Date().toISOString()});
    if (i===20) storage.data.set("msg:"+id+":000000000001",{
      id:id+":1",seq:1,sender:"guest",content:"The 21st guest's message",
      clientMessageId:"test-21st-message-id",createdAt:new Date().toISOString(),status:"stored"});
  }
  const one=await call(room,"/v1/reception/pending",{},owner.token,"GET");
  const two=await call(room,"/v1/reception/pending",{},owner.token,"GET");
  assert.equal(one.status,200); assert.equal(two.status,200);
  assert.equal(one.json.pending.length,0);
  assert.equal(two.json.pending.length,1);
  assert.equal(two.json.pending[0].message.content,"The 21st guest's message");
});
test("client replay ID cannot silently post different content or change sender", async () => {
  const room=new NoemaRelayRoom({storage:memoryStore()}, {});
  const owner=await register(room),guest=await register(room);
  const invite=await call(room,"/v1/invites",{},owner.token);
  const joined=await call(room,"/v1/invites/redeem",{token:invite.json.token},guest.token);
  const url="/v1/threads/"+joined.json.thread.id+"/messages", cid="replay-message-identifier";
  assert.equal((await call(room,url,{clientMessageId:cid,content:"first"},guest.token)).status,201);
  assert.equal((await call(room,url,{clientMessageId:cid,content:"second"},guest.token)).status,409);
  const got=await call(room,url+"?after=0",{},owner.token,"GET");
  assert.equal(got.json.messages.length,1);
  assert.equal(got.json.messages[0].content,"first");
});
