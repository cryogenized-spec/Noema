import {test} from "node:test";
import assert from "node:assert/strict";
import {AccountMailbox} from "../src/account-mailbox.mjs";

const accountId="account_test_1234567890";
const deviceId="device_owner_1234567890";
const bodyText=(n)=>({
  clientMessageId:"message_"+String(n).padStart(14,"0"),
  content:"enc1."+"A".repeat(16)+"."+"B".repeat(40),
});
function storage(){
  const data=new Map();
  const tx={
    get:async key=>data.get(key),
    put:async(key,value)=>{data.set(key,value);},
    delete:async key=>{data.delete(key);},
  };
  return {
    ...tx,data,
    transaction:async fn=>fn(tx),
    list:async({prefix})=>new Map([...data].filter(([key])=>key.startsWith(prefix))),
  };
}
async function setup(){
  const store=storage();
  await store.put("accounts:entry:"+accountId,{id:accountId,status:"active"});
  await store.put("accounts:member:"+accountId+":"+deviceId,{
    accountId,deviceId,status:"active",role:"owner",approvedAt:"2026-11-18T09:00:00Z",
  });
  const active=async(id,device)=>{
    const a=await store.get("accounts:entry:"+id);
    const m=await store.get("accounts:member:"+id+":"+device);
    return a?.status==="active"&&m?.status==="active"&&m.approvedAt&&m.deviceId===device;
  };
  const now=()=>Date.parse("2026-11-18T10:00:00Z");
  return {store,mail:new AccountMailbox(store,active,now)};
}
const route=async(mail,device= deviceId,data,method="POST",suffix="")=>{
  const request=new Request("https://noema.example/v1/accounts/"+accountId+"/mail/messages"+suffix,{
    method,
    ...(method==="POST"?{body:JSON.stringify(data)}:{}),
  });
  const response=await mail.route(request,{deviceId:device},accountId,"messages",data);
  return {status:response.status,data:await response.json()};
};

test("no unlimited storage: 40 messages per account-day; exact duplicates do not spend quota",async()=>{
  const {mail,store}=await setup();
  for(let i=0;i<40;i++){
    const sent=await route(mail,deviceId,bodyText(i));
    assert.equal(sent.status,201,JSON.stringify(sent));
  }
  const over=await route(mail,deviceId,bodyText(40));
  assert.equal(over.status,429);
  const duplicate=await route(mail,deviceId,bodyText(0));
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.replayed,true);
  assert.equal((await store.get("account-mail:meta:"+accountId)).count,40);
  const inbox=await route(mail,deviceId,undefined,"GET");
  assert.equal(inbox.status,200);
  assert.equal(inbox.data.messages.length,40);
  assert.equal(inbox.data.nextSeq,40);
  assert.equal(inbox.data.hasMore,false);
  assert.equal(inbox.data.messages[0].createdAt,"2026-11-18T10:00:00.000Z");
});

test("full staging mailbox returns bounded-storage error rather than unbounded writes",async()=>{
  const {mail,store}=await setup();
  await store.put("account-mail:meta:"+accountId,{lastSeq:240,count:240});
  const blocked=await route(mail,deviceId,bodyText(2));
  assert.equal(blocked.status,507);
  assert.equal((await store.get("account-mail:meta:"+accountId)).count,240);
});

test("message polling is cursor-bounded, paginated and rejects malformed cursors",async()=>{
  const {mail,store}=await setup();
  for(let i=1;i<=51;i++){
    const content=bodyText(i);
    const msg={id:accountId+":"+i,seq:i,...content,senderDeviceId:deviceId};
    await store.put("account-mail:message:"+accountId+":"+String(i).padStart(12,"0"),msg);
  }
  await store.put("account-mail:meta:"+accountId,{lastSeq:51,count:51});
  const first=await route(mail,deviceId,undefined,"GET","?after=0");
  assert.equal(first.status,200);
  assert.equal(first.data.messages.length,50);
  assert.equal(first.data.messages[0].seq,1);
  assert.equal(first.data.messages.at(-1).seq,50);
  assert.equal(first.data.hasMore,true);
  const second=await route(mail,deviceId,undefined,"GET","?after=50");
  assert.equal(second.data.messages.length,1);
  assert.equal(second.data.messages[0].seq,51);
  assert.equal(second.data.hasMore,false);
  assert.equal((await route(mail,deviceId,undefined,"GET","?after=-1")).status,400);
  assert.equal((await route(mail,deviceId,undefined,"GET","?after=1e9")).status,400);
});

test("rejected or revoked members cannot obtain message history or store ciphertext",async()=>{
  const {mail,store}=await setup();
  const bad="device_other_1234567890";
  assert.equal((await route(mail,bad,bodyText(1))).status,404);
  assert.equal((await route(mail,bad,undefined,"GET")).status,404);
  await store.put("accounts:member:"+accountId+":"+deviceId,{
    accountId,deviceId,status:"revoked",role:"owner",approvedAt:"2026-11-18T09:00:00Z",
  });
  assert.equal((await route(mail,deviceId,bodyText(2))).status,404);
  assert.equal((await route(mail,deviceId,undefined,"GET")).status,404);
  assert.equal((await store.list({prefix:"account-mail:message:"+accountId+":"})).size,0);
});
