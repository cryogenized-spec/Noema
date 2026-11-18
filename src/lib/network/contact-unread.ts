/**
 * Unread contact state belongs to the owner browser, never to the Cloudflare
 * relay. Persist only message sequence numbers; do not cache ciphertext or
 * invitation secrets in localStorage.
 */
import type {RelayMessage} from "./relay-client";

export const CONTACT_READ_EVENT = "noema:contact-read";
export const CONTACT_READ_PREFIX = "noema:contact-read-v1:";

export const contactReadKey = (deviceId:string, threadId:string) =>
  CONTACT_READ_PREFIX + deviceId + ":" + threadId;

export function unreadIncomingCount(
  messages:ReadonlyArray<Pick<RelayMessage,"sender"|"seq">>, lastRead:number,
):number {
  return messages.filter(message=>message.sender==="guest" && message.seq>lastRead).length;
}

export function latestIncomingSequence(
  messages:ReadonlyArray<Pick<RelayMessage,"sender"|"seq">>,
):number {
  return messages.reduce((latest,message)=>
    message.sender==="guest" && message.seq>latest?message.seq:latest,0);
}

export function lastReadIncoming(deviceId:string,threadId:string):number {
  try {
    const value=Number(window.localStorage.getItem(contactReadKey(deviceId,threadId)));
    return Number.isSafeInteger(value)&&value>=0?value:0;
  } catch { return 0; }
}

export function markIncomingRead(deviceId:string,threadId:string,lastVisibleGuestSeq:number):void {
  if(!Number.isSafeInteger(lastVisibleGuestSeq)||lastVisibleGuestSeq<=0)return;
  try {
    const key=contactReadKey(deviceId,threadId);
    const before=lastReadIncoming(deviceId,threadId);
    if(lastVisibleGuestSeq<=before)return;
    window.localStorage.setItem(key,String(lastVisibleGuestSeq));
    window.dispatchEvent(new Event(CONTACT_READ_EVENT));
  } catch {
    // Local storage may be disabled. Messages still render; unread badges
    // remain best effort and cannot be claimed as synchronized read receipts.
  }
}
