/** NOEMA invite cipher: interoperable with the owner PWA. No external SDK. */
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=(u)=>btoa(Array.from(u,x=>String.fromCharCode(x)).join(""))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const from64=(s)=>{
  if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error("Invalid key encoding");
  return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")
    .padEnd(Math.ceil(s.length/4)*4,"=")),x=>x.charCodeAt(0));
};
const buf=(data)=>new Uint8Array(data).buffer;
const bytes=(txt)=>buf(enc.encode(txt));
export const base64url=b64;
export async function deviceFingerprint(jwk){
  if(jwk?.kty!=="EC"||jwk?.crv!=="P-256"||!jwk?.x||!jwk?.y)
    throw Error("Invalid signing key");
  const input=JSON.stringify(["NOEMA_DEVICE_V1",jwk.x,jwk.y]);
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes(input))));
}
export async function importSecret(secret){
  if(typeof secret!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw Error("Invitation is missing its decryption key");
  const raw=from64(secret);
  if(raw.length!==32)throw Error("Invalid invitation encryption key");
  return crypto.subtle.importKey("raw",buf(raw),"HKDF",false,["deriveKey"]);
}
const keyFor=async(secret,threadId)=>{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(threadId))throw Error("Invalid thread");
  return crypto.subtle.deriveKey({
    name:"HKDF",hash:"SHA-256",
    salt:bytes("NOEMA_CONTACT_AES_GCM_V1"),
    info:bytes(threadId),
  },secret,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
};
const aad=(threadId,clientId)=>bytes(JSON.stringify(["NOEMA_V1",threadId,clientId]));
export async function seal(secret,threadId,clientId,message){
  if(!message.trim()||message.length>3000)throw Error("Message exceeds 3000 characters");
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({
    name:"AES-GCM",iv:buf(nonce),additionalData:aad(threadId,clientId),tagLength:128,
  },await keyFor(secret,threadId),bytes(message));
  return "enc1."+b64(nonce)+"."+b64(new Uint8Array(encrypted));
}
export async function open(secret,threadId,clientId,ciphertext){
  const match=/^enc1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{16,7990})$/.exec(ciphertext);
  if(!match)throw Error("Invalid encrypted message");
  const plaintext=await crypto.subtle.decrypt({
    name:"AES-GCM",iv:buf(from64(match[1])),
    additionalData:aad(threadId,clientId),tagLength:128,
  },await keyFor(secret,threadId),buf(from64(match[2])));
  const result=dec.decode(plaintext);
  if(result.length>3000)throw Error("Decrypted message exceeds limit");
  return result;
}
export const inviteKeyFromHash=(hash)=>{
  const secret=new URLSearchParams(String(hash||"").replace(/^#/,"")).get("k")||"";
  return /^[A-Za-z0-9_-]{43}$/.test(secret)?secret:"";
};
export const deviceProofBytes=(deviceId,challenge,audience,issuedAt)=>
  bytes("NOEMA_DEVICE_PROOF_V1\n"+JSON.stringify([deviceId,challenge,audience,issuedAt]));
