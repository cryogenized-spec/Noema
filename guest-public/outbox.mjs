/** Ciphertext-only guest outbox metadata. Never persist plaintext drafts,
 * raw invitation fragments or bearer tokens. Replays keep the original ID.
 */
const ID=/^[A-Za-z0-9_-]{12,90}$/;
const CIPHER=/^enc1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{16,7990}$/;
export const outboxKey=(deviceId,threadId,clientMessageId)=>
  "outbox:"+deviceId+":"+threadId+":"+clientMessageId;
export function validOutboxRecord(value){
  const allowed=new Set(["id","deviceId","threadId","keyId","clientMessageId","ciphertext","createdAt","blocked"]);
  return !!value && Object.keys(value).every(key=>allowed.has(key)) &&
    (value.blocked===undefined || typeof value.blocked==="boolean") &&
    ID.test(value.deviceId)&&ID.test(value.threadId)&&
    ID.test(value.keyId)&&ID.test(value.clientMessageId)&&
    value.id===outboxKey(value.deviceId,value.threadId,value.clientMessageId) &&
    CIPHER.test(value.ciphertext)&&value.ciphertext.length<=8000&&
    !Number.isNaN(Date.parse(value.createdAt));
}
export function permanentDeliveryFailure(status){
  return [400,403,404,409,410,422].includes(status);
}
