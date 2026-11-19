import {test} from "node:test";
import assert from "node:assert/strict";
import {
  validPushEndpoint,normalizePushSubscription,pushConfigured,sendWebPush,GENERIC_PUSH_PAYLOAD,
} from "../src/web-push.mjs";

const b64=bytes=>Buffer.from(bytes).toString("base64url");
const unb64=value=>new Uint8Array(Buffer.from(value,"base64url"));
const bytes=text=>new TextEncoder().encode(text);
const concat=(...arrays)=>Uint8Array.from(arrays.flatMap(a=>Array.from(a)));
async function mac(key,text) {
  const k=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",k,text));
}
async function stretch(key,info,n){return (await mac(key,concat(info,Uint8Array.of(1)))).slice(0,n);}
async function fixture(){
  const vapid=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const pub=new Uint8Array(await crypto.subtle.exportKey("raw",vapid.publicKey));
  const priv=await crypto.subtle.exportKey("jwk",vapid.privateKey);
  const receiver=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const endpoint="https://fcm.googleapis.com/fcm/send/NOEMA-test-subscription";
  return {env:{
    PUSH_ENABLED:"true",VAPID_PUBLIC_KEY:b64(pub),VAPID_PRIVATE_KEY:priv.d,
    VAPID_SUBJECT:"mailto:push-admin@example.com",
  },receiver,subscription:{endpoint,keys:{
    p256dh:b64(new Uint8Array(await crypto.subtle.exportKey("raw",receiver.publicKey))),
    auth:b64(crypto.getRandomValues(new Uint8Array(16))),
  }}};
}
test("push accepts only bounded, exact known push-service hosts",()=>{
  const yes=[
    "https://fcm.googleapis.com/fcm/send/abc12345678",
    "https://fcm-xm.googleapis.com/fcm/send/abc12345678",
    "https://updates.push.services.mozilla.com/wpush/v2/abcdef",
    "https://web.push.apple.com/Q1234567890abcdef",
  ];
  for(const endpoint of yes)assert.equal(validPushEndpoint(endpoint),true,endpoint);
  const no=[
    "http://fcm.googleapis.com/fcm/send/test",
    "https://fcm.googleapis.com.evil.tld/fcm/send/test",
    "https://example.com/push/notification",
    "https://127.0.0.1/notifications",
    "https://user:pass@fcm.googleapis.com/fcm/send/test",
    "https://fcm.googleapis.com:8443/fcm/send/test",
    "https://fcm.googleapis.com/a#b",
    "https://fcm.googleapis.com",
  ];
  for(const endpoint of no)assert.equal(validPushEndpoint(endpoint),false,endpoint);
});
test("push subscriptions require browser P-256 and a 16-byte authentication secret",async()=>{
  const {subscription}=await fixture();
  assert.deepEqual(normalizePushSubscription(subscription),subscription);
  assert.throws(()=>normalizePushSubscription({...subscription,keys:{...subscription.keys,auth:"aa"}}));
  assert.throws(()=>normalizePushSubscription({...subscription,endpoint:"https://evil.example/steal"}));
});
test("VAPID is authenticated, encrypted notification decrypts to generic text only",async()=>{
  const {env,receiver,subscription}=await fixture();
  assert.equal(pushConfigured(env),true);
  assert.equal(pushConfigured({...env,PUSH_ENABLED:"false"}),false);
  const calls=[];
  const send=await sendWebPush(subscription,env,async(url,init)=>{
    calls.push({url,init});return new Response(null,{status:201});
  });
  assert.deepEqual(send,{kind:"sent",status:201});
  assert.equal(calls.length,1);
  const {url,init}=calls[0];
  assert.equal(url,subscription.endpoint);
  assert.equal(init.method,"POST");
  assert.equal(init.headers["Content-Encoding"],"aes128gcm");
  assert.equal(init.headers.TTL,"300");
  const auth=init.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(auth);
  assert.equal(auth[2],env.VAPID_PUBLIC_KEY);
  const [header,payload,sig]=auth[1].split(".");
  assert.equal(JSON.parse(Buffer.from(header,"base64url").toString()).alg,"ES256");
  const claims=JSON.parse(Buffer.from(payload,"base64url").toString());
  assert.equal(claims.aud,"https://fcm.googleapis.com");
  assert.equal(claims.sub,env.VAPID_SUBJECT);
  assert.ok(claims.exp>Math.floor(Date.now()/1000));
  const signing=await crypto.subtle.importKey("raw",unb64(env.VAPID_PUBLIC_KEY),{name:"ECDSA",namedCurve:"P-256"},true,["verify"]);
  assert.equal(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},signing,unb64(sig),bytes(header+"."+payload)),true);
  const raw=new Uint8Array(init.body);
  assert.equal(Buffer.from(raw).includes(Buffer.from("New NOEMA message")),false);
  const salt=raw.slice(0,16),rs=new DataView(raw.buffer,16,4).getUint32(0);
  assert.equal(rs,4096);
  const peerPub=raw.slice(21,21+raw[20]);
  const peer=await crypto.subtle.importKey("raw",peerPub,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:peer},receiver.privateKey,256));
  const keyInfo=concat(bytes("WebPush: info\0"),unb64(subscription.keys.p256dh),peerPub);
  const ikm=await stretch(await mac(unb64(subscription.keys.auth),secret),keyInfo,32);
  const prk=await mac(salt,ikm);
  const cek=await stretch(prk,bytes("Content-Encoding: aes128gcm\0"),16);
  const nonce=await stretch(prk,bytes("Content-Encoding: nonce\0"),12);
  const aes=await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["decrypt"]);
  const decrypted=new Uint8Array(await crypto.subtle.decrypt(
    {name:"AES-GCM",iv:nonce},aes,raw.slice(21+raw[20])));
  assert.equal(decrypted.at(-1),2);
  assert.deepEqual(JSON.parse(Buffer.from(decrypted.slice(0,-1)).toString()),GENERIC_PUSH_PAYLOAD);
});
test("push suppresses delivery unless explicitly enabled, and cleans up gone endpoints",async()=>{
  const {env,subscription}=await fixture();
  assert.deepEqual(await sendWebPush(subscription,{...env,PUSH_ENABLED:"false"},()=>{throw Error("Unexpected network");}),{kind:"disabled"});
  const gone=await sendWebPush(subscription,env,async()=>new Response(null,{status:410}));
  assert.deepEqual(gone,{kind:"gone",status:410});
  const failure=await sendWebPush(subscription,env,async()=>new Response(null,{status:503}));
  assert.deepEqual(failure,{kind:"failed",status:503});
});
