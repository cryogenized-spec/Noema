import { test } from "node:test";
import assert from "node:assert/strict";
import { NoemaRelayRoom } from "../src/index.mjs";
import { fingerprint,b64url,proofBytes,LIMITS } from "../src/protocol.mjs";

const ROOT="https://relay.example";
const ENCRYPTED="enc1."+"A".repeat(16)+"."+"B".repeat(64);
function storage(){
  const map=new Map();
  const txn={
    get:async key=>map.get(key),
    put:async(key,value)=>{map.set(key,value);},
    delete:async key=>{map.delete(key);},
  };
  return {...txn,data:map,
    list:async({prefix})=>new Map([...map].filter(([key])=>key.startsWith(prefix))),
    transaction:async f=>f(txn)};
}
const call=async(room,path,data={},bearer="",method="POST")=>{
  const resp=await room.fetch(new Request(ROOT+path,{
    method,headers:{"Content-Type":"application/json","CF-Connecting-IP":"203.0.113.5",
      ...(bearer?{"Authorization":"Bearer "+bearer}:{})},
    ...(method!=="GET"?{body:JSON.stringify(data)}:{}),
  }));
  return {status:resp.status,body:await resp.json()};
};
async function identity(room){
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const deviceId=await fingerprint(publicJwk);
  const challenge=await call(room,"/v1/auth/challenge",{deviceId,publicJwk});
  assert.equal(challenge.status,200);
  const proof={deviceId,publicJwk,challenge:challenge.body.challenge,
    audience:ROOT,issuedAt:new Date().toISOString()};
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},pair.privateKey,proofBytes(proof));
  const verified=await call(room,"/v1/auth/verify",{...proof,signature:b64url(new Uint8Array(sig))});
  assert.equal(verified.status,200);
  return {deviceId,token:verified.body.token,proof,signature:b64url(new Uint8Array(sig))};
}
async function setup(){
  const env={OWNER_DEVICE_ID:""};
  const store=storage(),room=new NoemaRelayRoom({storage:store},env);
  const owner=await identity(room);
  env.OWNER_DEVICE_ID=owner.deviceId;
  const guest=await identity(room),attacker=await identity(room);
  return {room,owner,guest,attacker,store,env};
}
async function threadSetup(){
  const setupResult=await setup();
  const {room,owner,guest}=setupResult;
  const keyId="secret-reference-id-001";
  const invite=await call(room,"/v1/invites",{alias:"Owner",keyId},owner.token);
  assert.equal(invite.status,201);
  const redeemed=await call(room,"/v1/invites/redeem",
    {token:invite.body.token,alias:"Visitor"},guest.token);
  assert.equal(redeemed.status,201);
  return {...setupResult,id:redeemed.body.thread.id,invite,thread:redeemed.body.thread};
}
test("owner is explicitly allowlisted, no self-service guest invitations",async()=>{
  const {room,guest,owner,env}=await setup();
  assert.equal((await call(room,"/v1/invites",{keyId:"key-reference-123456"},guest.token)).status,403);
  env.OWNER_DEVICE_ID="";
  assert.equal((await call(room,"/v1/invites",{keyId:"key-reference-123456"},owner.token)).status,403);
  env.OWNER_DEVICE_ID=owner.deviceId;
  const denied=await call(room,"/v1/invites",{keyId:"key-reference-123456",secret:"sensitive"},owner.token);
  assert.equal(denied.status,400);
});
test("device signatures cannot be replayed",async()=>{
  const {room,owner}=await setup();
  assert.equal((await call(room,"/v1/auth/verify",
    {...owner.proof,signature:owner.signature})).status,401);
});
test("one-use invitations expose only key identifiers and are revocable",async()=>{
  const {room,owner,guest,attacker,store}=await setup();
  const invited=await call(room,"/v1/invites",{keyId:"opaque-key-id-123456",alias:"Maker"},owner.token);
  assert.equal(invited.status,201);
  assert.equal([...store.data.keys()].some(k=>k.includes(invited.body.token)),false);
  const join=await call(room,"/v1/invites/redeem",
    {token:invited.body.token,alias:"Customer"},guest.token);
  assert.equal(join.status,201);
  assert.equal(join.body.thread.keyId,"opaque-key-id-123456");
  assert.equal(join.body.thread.receptionEnabled,false);
  assert.equal((await call(room,"/v1/invites/redeem",
    {token:invited.body.token},attacker.token)).status,410);
  const next=await call(room,"/v1/invites",{keyId:"key-two-12345678"},owner.token);
  assert.equal((await call(room,"/v1/invites/revoke",{token:next.body.token},attacker.token)).status,403);
  assert.equal((await call(room,"/v1/invites/revoke",{token:next.body.token},owner.token)).status,200);
  assert.equal((await call(room,"/v1/invites/redeem",
    {token:next.body.token},guest.token)).status,410);
});
test("server rejects plaintext and unauthorised cross-thread access; encrypted retries are idempotent",async()=>{
  const {room,owner,guest,attacker,id,store}=await threadSetup();
  const route="/v1/threads/"+id+"/messages";
  const plain=await call(room,route,{content:"Hello",clientMessageId:"message-id-0000123"},guest.token);
  assert.equal(plain.status,400);
  const input={content:ENCRYPTED,clientMessageId:"message-id-0000123"};
  const one=await call(room,route,input,guest.token);
  assert.equal(one.status,201);
  const twice=await call(room,route,input,guest.token);
  assert.equal(twice.status,201);
  assert.equal(twice.body.message.seq,one.body.message.seq);
  assert.equal((await call(room,route,{...input,content:"enc1."+"C".repeat(16)+"."+"D".repeat(64)},guest.token)).status,409);
  assert.equal((await call(room,"/v1/threads/"+id,{},attacker.token,"GET")).status,404);
  assert.equal((await call(room,route+"?after=0",{},attacker.token,"GET")).status,404);
  const records=[...store.data.values()].filter(v=>v && v.sender==="guest");
  assert.equal(records.length>=1,true);
  assert.equal(records[0].content,ENCRYPTED);
  assert.equal((await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token)).status,403);
});
test("global and per-conversation reception must both be explicitly enabled for NEW guest messages",async()=>{
  const {room,owner,guest,id}=await threadSetup();
  const m="/v1/threads/"+id+"/messages", p="/v1/threads/"+id+"/reception";
  assert.equal((await call(room,p,{enabled:true},guest.token)).status,403);
  const initial=await call(room,m,{content:ENCRYPTED,clientMessageId:"msg-before-0000123"},guest.token);
  assert.equal(initial.status,201);
  assert.equal((await call(room,p,{enabled:true},owner.token)).status,200);
  assert.equal((await call(room,"/v1/reception/pending",{},owner.token,"GET")).body.pending.length,0);
  const on=await call(room,"/v1/reception/policy",
    {enabled:true,maxDailyCalls:2,maxThreadCalls:1},owner.token);
  assert.equal(on.status,200);
  const next=await call(room,m,{content:ENCRYPTED,clientMessageId:"msg-after-00000123"},guest.token);
  assert.equal(next.status,201);
  const pending=await call(room,"/v1/reception/pending",{},owner.token,"GET");
  assert.deepEqual(pending.body.pending.map(x=>x.message.seq),[2]);
  assert.equal((await call(room,"/v1/threads/"+id+"/agent-claim",{seq:1},owner.token)).status,403);
  assert.equal((await call(room,"/v1/threads/"+id+"/agent-claim",{seq:2},guest.token)).status,403);
  const claim=await call(room,"/v1/threads/"+id+"/agent-claim",{seq:2},owner.token);
  assert.equal(claim.status,200);
  assert.equal((await call(room,"/v1/threads/"+id+"/agent-claim",{seq:2},owner.token)).status,403);
  assert.equal((await call(room,m,{
    content:ENCRYPTED,clientMessageId:"ai-answer-123456789",asAgent:true,
    sourceSeq:2,claimToken:"wrong-token-123456789"},owner.token)).status,403);
  const answered=await call(room,m,{
    content:ENCRYPTED,clientMessageId:"ai-answer-123456789",asAgent:true,
    sourceSeq:2,claimToken:claim.body.claimToken},owner.token);
  assert.equal(answered.status,201);
  assert.equal(answered.body.message.sender,"agent");
  assert.equal((await call(room,m,{
    content:ENCRYPTED,clientMessageId:"ai-answer-123456789",asAgent:true,
    sourceSeq:2,claimToken:claim.body.claimToken},owner.token)).body.message.seq,3);
  const after=await call(room,m,{content:ENCRYPTED,clientMessageId:"msg-after-two-0000123"},guest.token);
  assert.equal(after.status,201);
  const exhausted=await call(room,"/v1/threads/"+id+"/agent-claim",{seq:4},owner.token);
  assert.equal(exhausted.status,429);
  assert.equal(exhausted.body.code,"AGENT_BUDGET_EXHAUSTED");
  assert.equal((await call(room,"/v1/reception/policy",
    {enabled:false,maxDailyCalls:2,maxThreadCalls:1},owner.token)).status,200);
  assert.equal((await call(room,"/v1/reception/pending",{},owner.token,"GET")).body.pending.length,0);
  assert.equal((await call(room,m,{
    content:ENCRYPTED,clientMessageId:"ai-after-off-12345",asAgent:true,
    sourceSeq:2,claimToken:claim.body.claimToken},owner.token)).status,403);
});
test("invalid budgets rejected and no relay endpoint can call OpenAI",async()=>{
  const {room,owner,id}=await threadSetup();
  assert.equal((await call(room,"/v1/reception/policy",
    {enabled:true,maxDailyCalls:LIMITS.agentCallsPerDay+1,maxThreadCalls:1},owner.token)).status,400);
  assert.equal((await call(room,"/v1/threads/"+id+"/agent-response",
    {apiKey:"DO_NOT_ACCEPT",seq:1},owner.token)).status,404);
});
