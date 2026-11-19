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
  const env={OWNER_DEVICE_ID:"test-owner-registration-initialized"};
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
  assert.equal((await call(room,"/v1/invites",{keyId:"key-reference-123456"},owner.token)).status,503);
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


test("new guest contacts and their encrypted messages are visible to the owner",async()=>{
  const {room,owner,guest,id,thread}=await threadSetup();
  const inbox=await call(room,"/v1/threads",{},owner.token,"GET");
  assert.equal(inbox.status,200);
  assert.equal(inbox.body.threads.length,1);
  assert.equal(inbox.body.threads[0].id,id);
  assert.equal(inbox.body.threads[0].guestAlias,"Visitor");
  assert.equal(inbox.body.threads[0].owner,owner.deviceId);
  assert.equal(inbox.body.threads[0].receptionEnabled,false);
  const guestRoster=await call(room,"/v1/threads",{},guest.token,"GET");
  assert.equal(guestRoster.body.threads[0].id,id);
  const messageId="guest-contact-message-00001";
  const delivered=await call(room,"/v1/threads/"+id+"/messages",
    {content:ENCRYPTED,clientMessageId:messageId},guest.token);
  assert.equal(delivered.status,201);
  assert.equal(delivered.body.message.sender,"guest");
  const ownerMessages=await call(room,"/v1/threads/"+id+"/messages?after=0",
    {},owner.token,"GET");
  assert.equal(ownerMessages.status,200);
  assert.equal(ownerMessages.body.messages.length,1);
  assert.equal(ownerMessages.body.messages[0].content,ENCRYPTED);
  assert.equal(ownerMessages.body.messages[0].clientMessageId,messageId);
  const updatedInbox=await call(room,"/v1/threads",{},owner.token,"GET");
  assert.equal(updatedInbox.body.threads[0].nextSeq,1);
  assert.ok(Date.parse(updatedInbox.body.threads[0].updatedAt)>0);
});


test("push is fail-closed without VAPID keys and cannot register anonymous devices",async()=>{
  const {room,owner,store}=await setup();
  const config=await call(room,"/v1/push/config",{},owner.token,"GET");
  assert.equal(config.status,200);
  assert.deepEqual(config.body,{available:false,publicKey:null,enabled:false,scope:"owner"});
  assert.equal((await call(room,"/v1/push/subscribe",{subscription:{}},owner.token)).status,503);
  assert.equal((await call(room,"/v1/push/unsubscribe",{},owner.token)).status,200);
  assert.equal([...store.data.keys()].some(key=>key.startsWith("push:")),false);
  assert.equal((await call(room,"/v1/push/config",{},"","GET")).status,401);
});

test("push delivers one generic encrypted wake to other participant, never to sender, only with opt-in",async()=>{
  const {room,owner,guest,attacker,id,store,env}=await threadSetup();
  env.APP_ORIGIN="https://noema-contact-staging.vercel.app";
  env.GUEST_ORIGIN="https://noema-guest.vercel.app";
  const keyPair=await crypto.subtle.generateKey(
    {name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const pub=new Uint8Array(await crypto.subtle.exportKey("raw",keyPair.publicKey));
  const priv=await crypto.subtle.exportKey("jwk",keyPair.privateKey);
  env.PUSH_ENABLED="true";
  env.VAPID_PUBLIC_KEY=b64url(pub);
  env.VAPID_PRIVATE_KEY=priv.d;
  env.VAPID_SUBJECT="mailto:push-admin@example.com";
  const sub=async who=>{
    const receiver=await crypto.subtle.generateKey(
      {name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
    const key=await crypto.subtle.exportKey("raw",receiver.publicKey);
    return {endpoint:"https://fcm.googleapis.com/fcm/send/noema-"+who+"-testing-123",
      keys:{p256dh:b64url(new Uint8Array(key)),
        auth:b64url(crypto.getRandomValues(new Uint8Array(16)))}};
  };
  const ownerSub=await sub("owner");
  const guestSub=await sub("guest");
  const pushCall=async(device,path,subscription,origin)=>{
    const response=await room.fetch(new Request(ROOT+path,{
      method:"POST",headers:{"Content-Type":"application/json",
        "Authorization":"Bearer "+device.token,"Origin":origin},
      body:JSON.stringify(subscription?{subscription}:{}),
    }));
    return {status:response.status,body:await response.json()};
  };
  const ownerOrigin=env.APP_ORIGIN,guestOrigin=env.GUEST_ORIGIN;
  assert.equal((await pushCall(owner,"/v1/push/subscribe",ownerSub,guestOrigin)).status,403);
  assert.equal((await pushCall(attacker,"/v1/push/subscribe",guestSub,guestOrigin)).status,403,
    "Uninvited accounts cannot create push recipients");
  assert.equal((await pushCall(owner,"/v1/push/subscribe",ownerSub,ownerOrigin)).status,200);
  assert.equal((await pushCall(guest,"/v1/push/subscribe",guestSub,guestOrigin)).status,200);
  assert.equal((await pushCall(guest,"/v1/push/subscribe",guestSub,guestOrigin)).status,200);
  const ownerConfig=await call(room,"/v1/push/config",{},owner.token,"GET");
  assert.equal(ownerConfig.body.available,true);
  assert.equal(ownerConfig.body.enabled,true);
  assert.equal(ownerConfig.body.publicKey,env.VAPID_PUBLIC_KEY);
  const senderCalls=[];
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=async(url,params)=>{
    senderCalls.push({url,params});
    return new Response(null,{status:201});
  };
  try{
    const input={content:ENCRYPTED,clientMessageId:"push-guest-message-12345"};
    const target="/v1/threads/"+id+"/messages";
    assert.equal((await call(room,target,input,guest.token)).status,201);
    assert.equal(senderCalls.length,1);
    assert.equal(senderCalls[0].url,ownerSub.endpoint);
    assert.equal((await call(room,target,input,guest.token)).status,201);
    assert.equal(senderCalls.length,1,"Idempotent message retries cannot spam push");
    assert.equal((await call(room,target,{content:ENCRYPTED,clientMessageId:"push-owner-message-12345"},owner.token)).status,201);
    assert.equal(senderCalls.length,2);
    assert.equal(senderCalls[1].url,guestSub.endpoint);
    assert.equal((await pushCall(owner,"/v1/push/unsubscribe",null,ownerOrigin)).status,200);
    assert.equal(store.data.has("push:"+owner.deviceId),false);
    assert.equal((await call(room,target,{content:ENCRYPTED,clientMessageId:"push-guest-message-22222"},guest.token)).status,201);
    assert.equal(senderCalls.length,2,"Opted-out owner receives no new push");
  }finally{globalThis.fetch=fetchBefore;}
});


test("encrypted histories paginate across 60-message boundaries without losing older records",async()=>{
  const {room,owner,guest,attacker,id,store}=await threadSetup();
  const count=147;
  // Preload a long encrypted conversation without stressing the unrelated IP
  // request-limit test. These are the same durable records written by POST.
  for(let seq=1;seq<=count;seq++){
    store.data.set("msg:"+id+":"+String(seq).padStart(12,"0"),{
      id:id+":"+seq,seq,clientMessageId:"client-message-"+String(seq).padStart(10,"0"),
      content:ENCRYPTED,sender:seq%2?"guest":"owner",
      createdAt:new Date(1763500000000+seq*1000).toISOString(),status:"stored",
    });
  }
  store.data.set("thread:"+id,{...store.data.get("thread:"+id),nextSeq:count});
  const target="/v1/threads/"+id+"/messages";
  const latest=await call(room,target,{},owner.token,"GET");
  assert.equal(latest.status,200);
  assert.equal(latest.body.messages.length,LIMITS.maxHistory);
  assert.equal(latest.body.messages[0].seq,88);
  assert.equal(latest.body.messages.at(-1).seq,147);
  assert.equal(latest.body.hasMore,true);
  assert.equal(latest.body.nextSeq,147);
  const page2=await call(room,target+"?before=88",{},guest.token,"GET");
  assert.equal(page2.status,200);
  assert.equal(page2.body.messages[0].seq,28);
  assert.equal(page2.body.messages.at(-1).seq,87);
  assert.equal(page2.body.hasMore,true);
  const page3=await call(room,target+"?before=28",{},owner.token,"GET");
  assert.deepEqual(page3.body.messages.map(x=>x.seq),Array.from({length:27},(_,i)=>i+1));
  assert.equal(page3.body.hasMore,false);
  const merged=[...page3.body.messages,...page2.body.messages,...latest.body.messages];
  assert.equal(merged.length,count);
  assert.deepEqual(merged.map(x=>x.seq),Array.from({length:count},(_,i)=>i+1));
  assert.ok(merged.every(x=>x.content===ENCRYPTED),"Relay never returns decrypted messages");
  assert.equal((await call(room,target+"?after=145",{},guest.token,"GET")).body.messages.length,2);
  assert.equal((await call(room,target+"?before=1",{},owner.token,"GET")).body.hasMore,false);
  for(const query of ["?before=xyz","?before=-1","?before=1.5","?after=-1",
    "?before=1&after=1","?after=9999999999999999999999"])
    assert.equal((await call(room,target+query,{},owner.token,"GET")).status,400,query);
  assert.equal((await call(room,target+"?before=88",{},attacker.token,"GET")).status,404,
    "History pages must enforce the same conversation membership");
});
