import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.mjs";
import {NoemaRelayRoom} from "../src/index.mjs";

const owner="https://noema-contact-staging.vercel.app";
const guest="https://noema-guest.vercel.app";
const relay="https://noema-contact-relay-staging.cryogenized.workers.dev";
const db=new Map();
const tx={get:async k=>db.get(k),put:async(k,v)=>{db.set(k,v);},
  delete:async k=>{db.delete(k);}};
const storage={...tx,list:async({prefix})=>new Map([...db].filter(([k])=>k.startsWith(prefix))),
  transaction:async fn=>fn(tx)};
const env={APP_ORIGIN:owner,GUEST_ORIGIN:guest,OWNER_DEVICE_ID:"existing-registered-owner-placeholder",
  NOEMA_ROOM:{idFromName:()=>({}),get:()=>({fetch:(req)=>new NoemaRelayRoom({storage},env).fetch(req)})}};
const call=(origin,path,method="GET",requestMethod)=>{
  const headers=new Headers();
  if(origin)headers.set("Origin",origin);
  if(requestMethod)headers.set("Access-Control-Request-Method",requestMethod);
  return worker.fetch(new Request(relay+path,{method,headers}),env);
};

test("public invite guest origin may preflight auth, redeem and encrypted chat",async()=>{
  for(const path of ["/v1/auth/challenge","/v1/auth/verify","/v1/invites/redeem",
    "/v1/threads","/v1/threads/abcdefghijklmnop/messages"]){
    const method=["/v1/threads"].includes(path)?"GET":"POST";
    const r=await call(guest,path,"OPTIONS",method);
    assert.equal(r.status,204,method+" "+path);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"),guest);
    assert.equal(r.headers.get("Access-Control-Allow-Headers"),"Authorization, Content-Type");
  }
  const anonymous=await call(guest,"/v1/threads","GET");
  assert.equal(anonymous.status,401,"Guest cannot list others' threads");
});
test("public guest origin never accepts owner invitation, policy or AI actions",async()=>{
  for(const path of ["/v1/invites","/v1/invites/revoke","/v1/reception/policy",
    "/v1/threads/abcdefghijklmnop/reception","/v1/threads/abcdefghijklmnop/agent-claim"]){
    const r=await call(guest,path,"OPTIONS","POST");
    assert.equal(r.status,403,path);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"),null);
  }
  assert.equal((await call(guest,"/v1/invites","POST")).status,403);
  assert.equal((await call(guest,"/v1/reception/pending","GET")).status,403);
});
test("existing owner origin unchanged, and unrelated origins rejected",async()=>{
  assert.equal((await call(owner,"/v1/invites","OPTIONS","POST")).status,204);
  assert.equal((await call("https://evil.example","/v1/auth/challenge","OPTIONS","POST")).status,403);
  assert.equal((await call("https://noema-guest.vercel.app.evil.test","/v1/threads","GET")).status,403);
});
