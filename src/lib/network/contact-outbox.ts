"use client";

import {db} from "@/lib/db/client";
import type {ContactOutboxRecord} from "@/types/contact-outbox";
import {RelayError,relayPostMessage,type RelaySession} from "@/lib/network/relay-client";

const ID=/^[A-Za-z0-9_-]{12,90}$/;
const ENVELOPE=/^enc1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{16,7990}$/;
const LIMIT=32;
export const outboxId=(deviceId:string,threadId:string,clientId:string)=>
  deviceId+":"+threadId+":"+clientId;
export function validQueuedEnvelope(item:ContactOutboxRecord):boolean {
  return ID.test(item.deviceId)&&ID.test(item.threadId)&&ID.test(item.keyId)&&
    ID.test(item.clientMessageId)&&item.id===outboxId(item.deviceId,item.threadId,item.clientMessageId) &&
    ENVELOPE.test(item.ciphertext)&&item.ciphertext.length<=8000&&
    !Number.isNaN(Date.parse(item.createdAt));
}
export function isTerminalOutboxError(error:unknown):boolean {
  return error instanceof RelayError && [400,403,404,409,410,422].includes(error.status);
}
export async function listContactOutbox(deviceId:string):Promise<ContactOutboxRecord[]> {
  if(!ID.test(deviceId))throw Error("Invalid signed device ID.");
  const rows=await db.contactOutbox.where("deviceId").equals(deviceId).toArray();
  return rows.filter(validQueuedEnvelope).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
/** Commit ciphertext to disk before any attempt to contact the relay. */
export async function persistContactOutbox(item:ContactOutboxRecord):Promise<void> {
  if(!validQueuedEnvelope(item))throw Error("Invalid encrypted outbox envelope.");
  await db.transaction("rw",db.contactOutbox,async()=>{
    const current=await db.contactOutbox.get(item.id);
    if(current){
      if(current.ciphertext!==item.ciphertext || current.deviceId!==item.deviceId)
        throw Error("Message ID collision: refusing ciphertext replacement.");
      return;
    }
    if(await db.contactOutbox.where("deviceId").equals(item.deviceId).count()>=LIMIT)
      throw Error("Encrypted outbox full. Retry or discard pending messages.");
    await db.contactOutbox.add(item);
  });
}
export async function discardContactOutbox(item:ContactOutboxRecord):Promise<void>{
  await db.contactOutbox.delete(item.id);
}
/** Idempotent replay: never re-encrypt or regenerate the clientMessageId.
 * HTTP 409/403 etc. are retained but blocked until an explicit user retry.
 */
export async function deliverContactOutbox(
  session:RelaySession,item:ContactOutboxRecord,
):Promise<"sent"|"pending"|"blocked"> {
  if(session.deviceId!==item.deviceId || !validQueuedEnvelope(item))
    throw Error("Outbox device or encrypted record mismatch.");
  try{
    await relayPostMessage(session,item.threadId,item.ciphertext,item.clientMessageId);
    await discardContactOutbox(item);
    return "sent";
  }catch(error){
    if(isTerminalOutboxError(error)){
      await db.contactOutbox.update(item.id,{blocked:true});
      return "blocked";
    }
    return "pending";
  }
}
