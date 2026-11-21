"use client";

import {accountEnrollmentAvailable} from "@/lib/network/account-client";
import {relayFetch,type RelaySession} from "@/lib/network/relay-client";
import {
  type TransferOffer,type TransferPackage,
} from "@/lib/identity/device-key-transfer";

/** Separate approval gate; no UI is activated by merely enabling accounts. */
export const deviceKeyProvisioningAvailable=accountEnrollmentAvailable &&
  process.env.NEXT_PUBLIC_NOEMA_KEY_TRANSFER_ENABLED==="true";

const endpoint=(accountId:string,requestId:string,action:"offer"|"package"|"claim")=>{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(accountId)||
     !/^[A-Za-z0-9_-]{12,90}$/.test(requestId))
    throw Error("Invalid approved pairing request.");
  return "/v1/accounts/"+encodeURIComponent(accountId)+
    "/key-transfers/"+encodeURIComponent(requestId)+"/"+action;
};
const requireEnabled=()=>{
  if(!deviceKeyProvisioningAvailable)
    throw Error("Secure device key provisioning has not been activated.");
};
export interface AuthenticatedCandidateOffer {
  offer:TransferOffer;
  /** Registered candidate device signing key for explicit verification. */
  candidateSigningKey:JsonWebKey;
}
export interface ClaimedKeyPackage {
  package:TransferPackage;
  ownerSigningKey:JsonWebKey;
}
export async function publishRecipientExchangeOffer(
  session:RelaySession,accountId:string,requestId:string,offer:TransferOffer,
):Promise<{stored:true}>{
  requireEnabled();
  if(session.deviceId!==offer.candidateDeviceId)
    throw Error("Recipient offer is for a different signed device.");
  return relayFetch(endpoint(accountId,requestId,"offer"),{
    method:"POST",session,body:{offer},
  });
}
export async function fetchCandidateExchangeOffer(
  session:RelaySession,accountId:string,requestId:string,
):Promise<AuthenticatedCandidateOffer>{
  requireEnabled();
  return relayFetch(endpoint(accountId,requestId,"offer"),{session});
}
export async function publishEncryptedAccountRoot(
  session:RelaySession,accountId:string,requestId:string,pkg:TransferPackage,
):Promise<{stored:true}>{
  requireEnabled();
  if(pkg.ownerDeviceId!==session.deviceId)
    throw Error("Only the owning signing device can upload its envelope.");
  return relayFetch(endpoint(accountId,requestId,"package"),{
    method:"POST",session,body:{package:pkg},
  });
}
export async function claimEncryptedAccountRoot(
  session:RelaySession,accountId:string,requestId:string,
):Promise<ClaimedKeyPackage>{
  requireEnabled();
  // One-time destructive claim. The caller must persist the decrypted key
  // atomically before treating the transfer as complete, and arrange recovery
  // if storage fails. Not invoked by the current NOEMA UI.
  return relayFetch(endpoint(accountId,requestId,"claim"),{
    method:"POST",session,body:{},
  });
}
