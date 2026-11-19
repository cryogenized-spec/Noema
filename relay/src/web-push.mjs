/**
 * Cloudflare-native Web Push sender.
 * RFC 8291 (aes128gcm), RFC 8292 (VAPID); only WebCrypto and fetch.
 * No message contents, contact aliases, tokens or thread IDs enter the payload.
 */
const encoder=new TextEncoder();
const toBytes=(s)=>encoder.encode(s);
const concat=(...chunks)=>{
  const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));
  let off=0;for(const c of chunks){result.set(c,off);off+=c.length;}return result;
};
const b64=(bytes)=>{
  let text="";for(let i=0;i<bytes.length;i++)text+=String.fromCharCode(bytes[i]);
  return btoa(text).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
};
const unb64=(value)=>{
  if(typeof value!=="string" || !/^[A-Za-z0-9_-]+$/.test(value))throw Error("Invalid key.");
  const text=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
  return Uint8Array.from(text,ch=>ch.charCodeAt(0));
};
const hostAllowed=(host)=>host==="fcm.googleapis.com" ||
  host==="fcm-xm.googleapis.com" ||
  host==="updates.push.services.mozilla.com" ||
  host==="push.services.mozilla.com" ||
  host==="web.push.apple.com" ||
  host==="api.push.apple.com";
export function validPushEndpoint(endpoint) {
  if(typeof endpoint!=="string" || endpoint.length>2048)return false;
  try {
    const url=new URL(endpoint);
    return url.protocol==="https:" && hostAllowed(url.hostname) &&
      !url.username && !url.password && !url.port && !url.hash &&
      url.pathname.length>5 && url.pathname.length<=1800;
  } catch {return false;}
}
export function normalizePushSubscription(value) {
  if(!value || typeof value!=="object" || !validPushEndpoint(value.endpoint) ||
     !value.keys || typeof value.keys!=="object")throw Error("Invalid push subscription.");
  const p256dh=unb64(value.keys.p256dh),auth=unb64(value.keys.auth);
  if(p256dh.length!==65 || p256dh[0]!==4 || auth.length!==16)
    throw Error("Invalid subscription cryptographic keys.");
  return {endpoint:value.endpoint,keys:{p256dh:b64(p256dh),auth:b64(auth)}};
}
export function pushConfigured(env) {
  try {
    const pub=unb64(env?.VAPID_PUBLIC_KEY),priv=unb64(env?.VAPID_PRIVATE_KEY);
    const subject=String(env?.VAPID_SUBJECT||"");
    return env?.PUSH_ENABLED==="true" && pub.length===65 && pub[0]===4 &&
      priv.length===32 && /^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/.test(subject);
  }catch{return false;}
}
async function hmac(key,data) {
  const imported=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",imported,data));
}
async function expand(prk,info,length) {
  const signed=await hmac(prk,concat(info,new Uint8Array([1])));
  return signed.slice(0,length);
}
async function encryptPayload(subscription,payload){
  const peer=await crypto.subtle.importKey("raw",unb64(subscription.keys.p256dh),
    {name:"ECDH",namedCurve:"P-256"},false,[]);
  const sender=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const senderKey=new Uint8Array(await crypto.subtle.exportKey("raw",sender.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits(
    {name:"ECDH",public:peer},sender.privateKey,256));
  const auth=unb64(subscription.keys.auth);
  const keyInfo=concat(toBytes("WebPush: info\0"),unb64(subscription.keys.p256dh),senderKey);
  const ikm=await expand(await hmac(auth,shared),keyInfo,32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const prk=await hmac(salt,ikm);
  const cek=await expand(prk,toBytes("Content-Encoding: aes128gcm\0"),16);
  const nonce=await expand(prk,toBytes("Content-Encoding: nonce\0"),12);
  const key=await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["encrypt"]);
  const plain=concat(toBytes(payload),new Uint8Array([2]));
  if(plain.length>3900)throw Error("Push message too large.");
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,plain));
  const rs=new Uint8Array([0,0,16,0]);
  return concat(salt,rs,new Uint8Array([senderKey.length]),senderKey,encrypted);
}
async function vapidToken(endpoint,env){
  const pub=unb64(env.VAPID_PUBLIC_KEY),priv=unb64(env.VAPID_PRIVATE_KEY);
  const jwk={kty:"EC",crv:"P-256",x:b64(pub.slice(1,33)),
    y:b64(pub.slice(33,65)),d:b64(priv),ext:false};
  const signingKey=await crypto.subtle.importKey("jwk",jwk,
    {name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const claims={aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,
    sub:env.VAPID_SUBJECT};
  const unsigned=b64(toBytes(JSON.stringify({alg:"ES256",typ:"JWT"})))+"."+
    b64(toBytes(JSON.stringify(claims)));
  const sig=new Uint8Array(await crypto.subtle.sign(
    {name:"ECDSA",hash:"SHA-256"},signingKey,toBytes(unsigned)));
  return unsigned+"."+b64(sig);
}
export const GENERIC_PUSH_PAYLOAD=Object.freeze({title:"New NOEMA message"});

/** Returns sent/gone/failed; failures never fail a committed chat message. */
export async function sendWebPush(subscription,env,fetcher=fetch) {
  if(!pushConfigured(env))return {kind:"disabled"};
  const valid=normalizePushSubscription(subscription);
  try {
    const [ciphertext,token]=await Promise.all([
      encryptPayload(valid,JSON.stringify(GENERIC_PUSH_PAYLOAD)),
      vapidToken(valid.endpoint,env),
    ]);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetcher(valid.endpoint,{method:"POST",headers:{
        "Content-Type":"application/octet-stream","Content-Encoding":"aes128gcm",
        Authorization:"vapid t="+token+", k="+env.VAPID_PUBLIC_KEY,
        TTL:"300",Urgency:"normal",
      },body:ciphertext,redirect:"error",signal:controller.signal});
      if(response.status===404||response.status===410)return {kind:"gone",status:response.status};
      return response.ok?{kind:"sent",status:response.status}:{kind:"failed",status:response.status};
    }finally{clearTimeout(timeout);}
  }catch{return {kind:"failed"};}
}
