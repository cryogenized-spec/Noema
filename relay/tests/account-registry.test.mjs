import {test} from "node:test";
import assert from "node:assert/strict";
import {NoemaRelayRoom} from "../src/index.mjs";
import {fingerprint,b64url,proofBytes} from "../src/protocol.mjs";

const ORIGIN="https://identity.test.noema";
const accountDisabled="Multi-user account enrollment is not activated.";
const mem=()=>{
  const data=new Map(),txn={
    get:async k=>data.get(k),
    put:async(k,v)=>{data.set(k,v);},
    delete:async k=>{data.delete(k);},
  };
  return {data,...txn,
    list:async({prefix})=>new Map([...data].filter(([key])=>key.startsWith(prefix))),
    transaction:async fn=>fn(txn)};
};
const request=async(room,path,session,body,method="POST")=>{
  const response=await room.fetch(new Request(ORIGIN+path,{
    method,headers:{
      "content-type":"application/json","CF-Connecting-IP":"203.0.113.49",
      ...(session?.token?{"Authorization":"Bearer "+session.token}:{})
    },
    ...(method==="POST"?{body:JSON.stringify(body??{})}:{})
  }));
  return {status:response.status,data:await response.json()};
};
async function device(room){
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const deviceId=await fingerprint(publicJwk);
  const challenge=await request(room,"/v1/auth/challenge",null,{deviceId,publicJwk});
  assert.equal(challenge.status,200);
  const proof={deviceId,publicJwk,challenge:challenge.data.challenge,
    audience:ORIGIN,issuedAt:new Date().toISOString()};
  const raw=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
    pair.privateKey,proofBytes(proof));
  const verified=await request(room,"/v1/auth/verify",null,
    {...proof,signature:b64url(new Uint8Array(raw))});
  assert.equal(verified.status,200);
  return {token:verified.data.token,deviceId,publicJwk,privateKey:pair.privateKey};
}
const sign=async(user,nonce,audience=ORIGIN)=>{
  const proof={deviceId:user.deviceId,publicJwk:user.publicJwk,
    challenge:nonce,audience,issuedAt:new Date().toISOString()};
  const signature=b64url(new Uint8Array(await crypto.subtle.sign(
    {name:"ECDSA",hash:"SHA-256"},user.privateKey,proofBytes(proof))));
  return {...proof,signature};
};
async function setup(enabled=true){
  const storage=mem(),env={OWNER_DEVICE_ID:"pilot-owned-but-not-a-registered-account",
    ACCOUNT_REGISTRATION_ENABLED:enabled?"true":"false"};
  const room=new NoemaRelayRoom({storage},env);
  const owner=await device(room),candidate=await device(room),outsider=await device(room);
  return {storage,env,room,owner,candidate,outsider};
}
async function create(room,user,handle="maker_hello"){
  return request(room,"/v1/accounts",user,{handle,displayName:"A friendly maker"});
}
const url=(id,tail="")=>"/v1/accounts/"+id+(tail?"/"+tail:"");

test("new account endpoints fail closed until enabled, leaving the old pilot identity intact",async()=>{
  const {room,owner,candidate}=await setup(false);
  const refused=await create(room,owner);
  assert.equal(refused.status,503);
  assert.equal(refused.data.error,accountDisabled);
  assert.equal((await request(room,"/v1/accounts",candidate,undefined,"GET")).status,503);
  assert.equal((await request(room,"/v1/identity",owner,undefined,"GET")).status,200);
});

test("owner account registration reserves server handles and ignores forged client roles",async()=>{
  const {room,owner,candidate,outsider}=await setup();
  assert.equal((await create(room,owner,"1bad")).status,400);
  const created=await request(room,"/v1/accounts",owner,{
    handle:"@Maker_Hello",displayName:"Founder",role:"member",status:"suspended",
  });
  assert.equal(created.status,201);
  const id=created.data.account.id;
  assert.equal(created.data.account.handle,"maker_hello");
  assert.equal(created.data.account.status,"active");
  assert.equal((await create(room,candidate,"maker_hello")).status,409);
  assert.equal((await create(room,owner,"another_handle")).status,409);
  assert.deepEqual((await request(room,"/v1/accounts",outsider,undefined,"GET")).data.accounts,[]);
  assert.equal((await request(room,url(id),outsider,undefined,"GET")).status,404);
  assert.equal((await request(room,url(id,"devices"),candidate,undefined,"GET")).status,403);
  const devices=await request(room,url(id,"devices"),owner,undefined,"GET");
  assert.equal(devices.data.devices[0].role,"owner");
  assert.equal(devices.data.devices[0].deviceId,owner.deviceId);
});

async function pendingSetup(){
  const setupResult=await setup();
  const {room,owner,candidate}=setupResult;
  const acct=await create(room,owner);
  assert.equal(acct.status,201);
  const id=acct.data.account.id;
  const offer=await request(room,url(id,"pair-offers"),owner,{});
  assert.equal(offer.status,201);
  const requested=await request(room,url(id,"pair-requests"),candidate,{token:offer.data.token});
  assert.equal(requested.status,201);
  return {...setupResult,id,offer,requested};
}

test("pair offers are short-lived, hashed, one-use and cannot be redeemed by owner",async()=>{
  const {room,storage,owner,candidate,outsider,id,offer,requested}=await pendingSetup();
  const repeat=await request(room,url(id,"pair-requests"),outsider,{token:offer.data.token});
  assert.equal(repeat.status,410);
  const pending=await request(room,url(id,"pair-requests"),owner,undefined,"GET");
  assert.equal(pending.status,200);
  assert.equal(pending.data.requests.length,1);
  assert.equal(pending.data.requests[0].candidateDeviceId,candidate.deviceId);
  assert.equal("verificationCode" in pending.data.requests[0],false);
  assert.match(requested.data.verificationCode,/^[0-9]{6}$/);
  assert.equal((await request(room,url(id,"pair-requests"),outsider,undefined,"GET")).status,403);
  assert.equal((await request(room,url(id,"pair-requests/"+requested.data.requestId+"/status"),
    candidate,undefined,"GET")).data.status,"pending");
  assert.equal((await request(room,url(id,"pair-requests/"+requested.data.requestId+"/status"),
    outsider,undefined,"GET")).status,404);
  const values=[...storage.data.entries()].map(x=>JSON.stringify(x)).join("\n");
  assert.equal(values.includes(offer.data.token),false);
  assert.equal(values.includes(requested.data.verificationCode),false);
});

test("pairing requires active owner, correct visual code and a fresh cryptographic signature",async()=>{
  const {room,owner,candidate,outsider,id,requested}=await pendingSetup();
  const pairingId=requested.data.requestId;
  const approval=url(id,"pair-requests/"+pairingId+"/approve");
  const fresh=await request(room,url(id,"pair-requests/"+pairingId+"/challenge"),owner,{});
  assert.equal(fresh.status,200);
  const proof=await sign(owner,fresh.data.challenge);
  const wrong=await request(room,approval,owner,{verificationCode:"999xyz",proof});
  assert.equal(wrong.status,401);
  const forged=await request(room,approval,outsider,{
    verificationCode:requested.data.verificationCode,proof});
  assert.equal(forged.status,401);
  const wrongCode=await request(room,approval,owner,{
    verificationCode:requested.data.verificationCode==="000000"?"000001":"000000",proof});
  assert.equal(wrongCode.status,403);
  const forgedAudience=await request(room,approval,owner,{
    verificationCode:requested.data.verificationCode,
    proof:await sign(owner,fresh.data.challenge,"https://attacker.example")});
  assert.equal(forgedAudience.status,401);
  const signed=await request(room,approval,owner,{
    verificationCode:requested.data.verificationCode,proof});
  assert.equal(signed.status,200);
  assert.equal(signed.data.memberDeviceId,candidate.deviceId);
  const repeated=await request(room,approval,owner,{verificationCode:requested.data.verificationCode,proof});
  assert.equal(repeated.status,403);
  const joined=await request(room,url(id),candidate,undefined,"GET");
  assert.equal(joined.status,200);
  assert.equal(joined.data.account.id,id);
  const candidateAccounts=await request(room,"/v1/accounts",candidate,undefined,"GET");
  assert.equal(candidateAccounts.status,200);
  assert.deepEqual(candidateAccounts.data.accounts.map(account=>account.id),[id]);
  assert.deepEqual(candidateAccounts.data.memberships,[{accountId:id,role:"member"}]);
  assert.equal((await request(room,url(id,"pair-offers"),candidate,{})).status,403);
  assert.equal((await request(room,url(id,"devices"),candidate,undefined,"GET")).status,403);
});

test("device revocation denies account access on existing authenticated bearer tokens",async()=>{
  const {room,owner,candidate,id,requested}=await pendingSetup();
  const requestId=requested.data.requestId;
  const c=await request(room,url(id,"pair-requests/"+requestId+"/challenge"),owner,{});
  const proof=await sign(owner,c.data.challenge);
  assert.equal((await request(room,url(id,"pair-requests/"+requestId+"/approve"),owner,
    {verificationCode:requested.data.verificationCode,proof})).status,200);
  assert.equal((await request(room,url(id),candidate,undefined,"GET")).status,200);
  assert.equal((await request(room,url(id,"devices/"+candidate.deviceId+"/revoke"),candidate,{})).status,403);
  assert.equal((await request(room,url(id,"devices/"+owner.deviceId+"/revoke"),owner,{})).status,403);
  assert.equal((await request(room,url(id,"devices/"+candidate.deviceId+"/revoke"),owner,{})).status,200);
  assert.equal((await request(room,url(id),candidate,undefined,"GET")).status,404);
  assert.deepEqual((await request(room,"/v1/accounts",candidate,undefined,"GET")).data.accounts,[]);
  assert.equal((await request(room,url(id,"pair-offers"),candidate,{})).status,403);
  assert.equal((await request(room,url(id,"devices"),owner,undefined,"GET")).data.devices
    .find(x=>x.deviceId===candidate.deviceId).status,"revoked");
});

test("account namespaces never expose another owner's account or membership",async()=>{
  const {room,owner,candidate,outsider}=await setup();
  const one=await create(room,owner,"alpha_user");
  const two=await create(room,outsider,"beta_user");
  assert.equal(one.status,201);
  assert.equal(two.status,201);
  const id1=one.data.account.id,id2=two.data.account.id;
  assert.equal((await request(room,url(id1),outsider,undefined,"GET")).status,404);
  assert.equal((await request(room,url(id2),owner,undefined,"GET")).status,404);
  assert.equal((await request(room,url(id2,"pair-offers"),owner,{})).status,403);
  assert.equal((await request(room,url(id1,"pair-requests"),candidate,{token:"unguessable-not-a-real-token-000"})).status,410);
});


test("new account mailbox stays disabled even when account enrollment is enabled",async()=>{
  const {room,owner,env}=await setup();
  const acct=await create(room,owner);
  const id=acct.data.account.id;
  const path=url(id,"mail/messages");
  const response=await request(room,path,owner,undefined,"GET");
  assert.equal(response.status,503);
  assert.equal(response.data.error,"Account mailbox is not activated.");
  env.ACCOUNT_MAILBOX_ENABLED="false";
  assert.equal((await request(room,path,owner,{content:"enc1.fake.fake",clientMessageId:"id-001234567891"})).status,503);
});

test("future ciphertext mailbox is scoped to signed account membership; no cross-account reads or plaintext",async()=>{
  const {room,owner,outsider,env,storage}=await setup();
  env.ACCOUNT_MAILBOX_ENABLED="true";
  const a=await create(room,owner,"my_account");
  const b=await create(room,outsider,"other_account");
  assert.equal(a.status,201);assert.equal(b.status,201);
  const idA=a.data.account.id,idB=b.data.account.id;
  const inboxA=url(idA,"mail/messages");
  const inboxB=url(idB,"mail/messages");
  const encrypted="enc1."+"A".repeat(16)+"."+"B".repeat(36);
  const body={clientMessageId:"mail-message-0012345678",content:encrypted};
  assert.equal((await request(room,inboxA,owner,{...body,content:"secret plaintext"})).status,400);
  assert.equal((await request(room,inboxA,outsider,body)).status,404);
  assert.equal((await request(room,inboxB,owner,body)).status,404);
  assert.equal((await request(room,inboxA,outsider,undefined,"GET")).status,404);
  const sent=await request(room,inboxA,owner,body);
  assert.equal(sent.status,201);
  assert.equal(sent.data.message.senderDeviceId,owner.deviceId);
  assert.equal(sent.data.message.status,"stored");
  const repeat=await request(room,inboxA,owner,body);
  assert.equal(repeat.status,200);
  assert.equal(repeat.data.replayed,true);
  assert.equal(repeat.data.message.seq,sent.data.message.seq);
  assert.equal((await request(room,inboxA,owner,
    {...body,content:"enc1."+"C".repeat(16)+"."+"D".repeat(36)})).status,409);
  const read=await request(room,inboxA+"?after=0",owner,undefined,"GET");
  assert.equal(read.status,200);
  assert.equal(read.data.nextSeq,1);
  assert.equal(read.data.messages.length,1);
  assert.equal(read.data.messages[0].content,encrypted);
  assert.equal((await request(room,inboxA+"?after=bad",owner,undefined,"GET")).status,400);
  assert.equal((await request(room,inboxB,outsider,undefined,"GET")).data.messages.length,0);
  const stored=[...storage.data.values()].map(v=>JSON.stringify(v)).join("\n");
  assert.equal(stored.includes("secret plaintext"),false);
});

test("a revoked signed member loses account mailbox read/write immediately, without invalidating unrelated accounts",async()=>{
  const {room,owner,candidate,id,requested,env}=await pendingSetup();
  env.ACCOUNT_MAILBOX_ENABLED="true";
  const pairingId=requested.data.requestId;
  const challenge=await request(room,url(id,"pair-requests/"+pairingId+"/challenge"),owner,{});
  const proof=await sign(owner,challenge.data.challenge);
  assert.equal((await request(room,url(id,"pair-requests/"+pairingId+"/approve"),owner,
    {verificationCode:requested.data.verificationCode,proof})).status,200);
  const path=url(id,"mail/messages");
  const encrypted={clientMessageId:"candidate-message-1234567",content:"enc1."+"B".repeat(16)+"."+"C".repeat(36)};
  const posted=await request(room,path,candidate,encrypted);
  assert.equal(posted.status,201);
  const ownerInbox=await request(room,path,owner,undefined,"GET");
  assert.equal(ownerInbox.data.messages[0].senderDeviceId,candidate.deviceId);
  assert.equal((await request(room,url(id,"devices/"+candidate.deviceId+"/revoke"),owner,{})).status,200);
  assert.equal((await request(room,path,candidate,undefined,"GET")).status,404);
  assert.equal((await request(room,path,candidate,{...encrypted,clientMessageId:"new-message-123456789"})).status,404);
  assert.equal((await request(room,path,owner,undefined,"GET")).data.messages.length,1);
});
