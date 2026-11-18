"use client";

import {accountEnrollmentAvailable} from "@/lib/network/account-client";
import {relayFetch,type RelaySession} from "@/lib/network/relay-client";

/**
 * Experimental account mailbox, deliberately NOT exposed in the UI.
 * Ciphertext-only transport has no shared account key exchange yet.
 * Do not treat an approved device as automatically able to decrypt history.
 */
export const accountMailboxAvailable = accountEnrollmentAvailable &&
  process.env.NEXT_PUBLIC_NOEMA_ACCOUNT_MAIL_ENABLED==="true";

const accountPath=(id:string)=>{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(id))
    throw new Error("Invalid account identifier.");
  return "/v1/accounts/"+encodeURIComponent(id)+"/mail/messages";
};
const allowed=()=>{
  if(!accountMailboxAvailable)
    throw new Error("Account mailbox is disabled until per-device E2EE keys are supported.");
};
export interface AccountCiphertextMessage {
  id:string;
  seq:number;
  clientMessageId:string;
  content:string;
  senderDeviceId:string;
  createdAt:string;
  status:"stored";
}
export async function listAccountCiphertext(
  session:RelaySession,accountId:string,after=0,
):Promise<{messages:AccountCiphertextMessage[];nextSeq:number;hasMore:boolean}>{
  allowed();
  if(!Number.isSafeInteger(after)||after<0)throw new Error("Invalid account message cursor.");
  return relayFetch(accountPath(accountId)+"?after="+after,{session});
}
export async function postAccountCiphertext(
  session:RelaySession,accountId:string,clientMessageId:string,ciphertext:string,
):Promise<{message:AccountCiphertextMessage;replayed:boolean}>{
  allowed();
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(clientMessageId))
    throw new Error("Invalid message ID.");
  if(typeof ciphertext!=="string" ||
    !/^enc1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{16,7990}$/.test(ciphertext) ||
    ciphertext.length>8000)
    throw new Error("Only already encrypted message envelopes are accepted.");
  return relayFetch(accountPath(accountId),{
    session,method:"POST",body:{clientMessageId,content:ciphertext},
  });
}
