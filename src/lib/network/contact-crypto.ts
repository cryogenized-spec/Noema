"use client";

import { db } from "@/lib/db/client";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = (data: Uint8Array): string => btoa(Array.from(data, (v) => String.fromCharCode(v)).join(""))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
const unb64 = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encrypted message encoding.");
  return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")
    .padEnd(Math.ceil(value.length/4)*4,"=")), (x)=>x.charCodeAt(0));
};
const toBuffer = (view:Uint8Array):ArrayBuffer => {
  const buffer=new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
};
export function newContactSecret(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
export function newContactKeyId(): string {
  return b64(crypto.getRandomValues(new Uint8Array(18)));
}
export async function saveContactSecret(keyId:string, secret:string): Promise<void> {
  const raw=unb64(secret);
  if (raw.length!==32 || !/^[A-Za-z0-9_-]{12,90}$/.test(keyId))
    throw new Error("Invalid invitation encryption key.");
  const key=await crypto.subtle.importKey("raw",toBuffer(raw),"HKDF",false,["deriveKey"]);
  await db.contactKeys.put({id:keyId,key,createdAt:new Date().toISOString()});
}
async function threadKey(keyId:string, threadId:string):Promise<CryptoKey> {
  const record=await db.contactKeys.get(keyId);
  if(!record)throw new Error("This device does not have this conversation's encryption key.");
  return crypto.subtle.deriveKey({
    name:"HKDF",hash:"SHA-256",salt:toBuffer(encoder.encode("NOEMA_CONTACT_AES_GCM_V1")),
    info:toBuffer(encoder.encode(threadId)),
  },record.key,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function additional(threadId:string,clientId:string):ArrayBuffer{
  return toBuffer(encoder.encode(JSON.stringify(["NOEMA_V1",threadId,clientId])));
}
export async function encryptContactMessage(
  keyId:string,threadId:string,clientId:string,content:string,
):Promise<string> {
  if (!content.trim() || content.length>3000) throw new Error("Message must be 1–3000 characters.");
  const key=await threadKey(keyId,threadId);
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({
    name:"AES-GCM",iv:toBuffer(nonce),additionalData:additional(threadId,clientId),tagLength:128,
  },key,toBuffer(encoder.encode(content)));
  return "enc1."+b64(nonce)+"."+b64(new Uint8Array(ciphertext));
}
export async function decryptContactMessage(
  keyId:string,threadId:string,clientId:string,envelope:string,
):Promise<string> {
  const match=/^enc1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{16,7990})$/.exec(envelope);
  if(!match)throw new Error("Unsupported encrypted message.");
  const key=await threadKey(keyId,threadId);
  const bytes=await crypto.subtle.decrypt({
    name:"AES-GCM",iv:toBuffer(unb64(match[1])),
    additionalData:additional(threadId,clientId),tagLength:128,
  },key,toBuffer(unb64(match[2])));
  const result=decoder.decode(bytes);
  if(result.length>3000)throw new Error("Decrypted message exceeded safety limit.");
  return result;
}
export function secretFromHash(fragment:string):string {
  const key=new URLSearchParams(fragment.replace(/^#/,"")).get("k") ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? key : "";
}
