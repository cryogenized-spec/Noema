"use client";

import { db } from "@/lib/db/client";
import {
  generateInviteSecret,generateInviteKeyId,importInviteSecret,
  encryptEnvelope,decryptEnvelope,contactSecretFromFragment,
} from "./contact-cipher";

export const newContactSecret=generateInviteSecret;
export const newContactKeyId=generateInviteKeyId;
export const secretFromHash=contactSecretFromFragment;

export async function saveContactSecret(keyId:string,secret:string):Promise<void>{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(keyId))throw Error("Invalid invite key identifier.");
  const key=await importInviteSecret(secret);
  // CryptoKey is non-extractable but usable by this origin's JS. Not a vault backup.
  await db.contactKeys.put({id:keyId,key,createdAt:new Date().toISOString()});
}
async function load(keyId:string):Promise<CryptoKey>{
  const saved=await db.contactKeys.get(keyId);
  if(!saved)throw Error("This browser has no encryption key for the conversation.");
  return saved.key;
}
export async function encryptContactMessage(keyId:string,threadId:string,id:string,text:string){
  return encryptEnvelope(await load(keyId),threadId,id,text);
}
export async function decryptContactMessage(keyId:string,threadId:string,id:string,ciphertext:string){
  return decryptEnvelope(await load(keyId),threadId,id,ciphertext);
}
