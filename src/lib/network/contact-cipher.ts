/** Pure WebCrypto primitives (no browser storage, network calls or npm dependencies). */
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const ascii=(data:Uint8Array)=>btoa(Array.from(data,(v)=>String.fromCharCode(v)).join(""))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const bytes=(value:string):Uint8Array=>{
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error("Invalid key encoding.");
  return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")
    .padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));
};
const buffer=(arr:Uint8Array):ArrayBuffer=>{
  const output=new ArrayBuffer(arr.byteLength);
  new Uint8Array(output).set(arr);return output;
};
export function generateInviteSecret():string{
  return ascii(crypto.getRandomValues(new Uint8Array(32)));
}
export function generateInviteKeyId():string{
  return ascii(crypto.getRandomValues(new Uint8Array(18)));
}
export async function importInviteSecret(secret:string):Promise<CryptoKey>{
  const raw=bytes(secret);
  if(raw.length!==32)throw Error("Invitation encryption secret must be 256 bits.");
  return crypto.subtle.importKey("raw",buffer(raw),"HKDF",false,["deriveKey"]);
}
async function keyForThread(secret:CryptoKey,threadId:string):Promise<CryptoKey>{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(threadId))throw Error("Invalid conversation identity.");
  return crypto.subtle.deriveKey({
    name:"HKDF",hash:"SHA-256",
    salt:buffer(encoder.encode("NOEMA_CONTACT_AES_GCM_V1")),
    info:buffer(encoder.encode(threadId)),
  },secret,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
const aad=(threadId:string,clientId:string)=>buffer(encoder.encode(
  JSON.stringify(["NOEMA_V1",threadId,clientId])));
export async function encryptEnvelope(
  secret:CryptoKey,threadId:string,clientId:string,message:string,
):Promise<string>{
  if(!message.trim() || message.length>3000)throw Error("Message must be 1–3000 characters.");
  const key=await keyForThread(secret,threadId);
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({
    name:"AES-GCM",iv:buffer(nonce),additionalData:aad(threadId,clientId),tagLength:128,
  },key,buffer(encoder.encode(message)));
  return "enc1."+ascii(nonce)+"."+ascii(new Uint8Array(data));
}
export async function decryptEnvelope(
  secret:CryptoKey,threadId:string,clientId:string,ciphertext:string,
):Promise<string>{
  const match=/^enc1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{16,7990})$/.exec(ciphertext);
  if(!match)throw Error("Not an encrypted NOEMA message.");
  const key=await keyForThread(secret,threadId);
  const data=await crypto.subtle.decrypt({
    name:"AES-GCM",iv:buffer(bytes(match[1])),
    additionalData:aad(threadId,clientId),tagLength:128,
  },key,buffer(bytes(match[2])));
  const plain=decoder.decode(data);
  if(plain.length>3000)throw Error("Decrypted text exceeds the size limit.");
  return plain;
}
export function contactSecretFromFragment(fragment:string):string{
  const token=new URLSearchParams(fragment.replace(/^#/,"")).get("k")??"";
  return /^[A-Za-z0-9_-]{43}$/.test(token)?token:"";
}
