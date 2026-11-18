"use client";

import {signDeviceChallenge} from "@/lib/security/device-identity";
import {
  relayAvailable, relayFetch, relayOrigin,
  type RelaySession,
} from "@/lib/network/relay-client";

/** A separate consent gate: the current messaging relay MUST remain independent.
 * Both the PWA AND Cloudflare must be explicitly enabled before enrolment.
 */
export const accountEnrollmentAvailable =
  process.env.NEXT_PUBLIC_NOEMA_ACCOUNTS_ENABLED === "true" && relayAvailable;

function enabled() {
  if(!accountEnrollmentAvailable)
    throw new Error("Multi-user accounts are not activated on this PWA.");
}
const segment=(value:string)=>{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(value))throw new Error("Invalid account or device identifier.");
  return encodeURIComponent(value);
};
const route=(id:string,action="")=>"/v1/accounts/"+segment(id)+(action?"/"+action:"");

export interface RegisteredAccount {
  id:string;handle:string;displayName:string;status:"active"|"suspended"|"recovering";createdAt:string;
}
export type AccountRole="owner"|"member";
export type MemberStatus="active"|"pending"|"revoked";
export interface LinkedDevice {
  deviceId:string;role:AccountRole;status:MemberStatus;approvedAt:string|null;revokedAt:string|null;
}
export interface PairRequest {
  id:string;candidateDeviceId:string;requestedAt:string;expiresAt:string;
}
export async function myAccounts(session:RelaySession) {
  enabled();
  return relayFetch<{accounts:RegisteredAccount[];memberships:Array<{accountId:string;role:AccountRole}>}>(
    "/v1/accounts",{session});
}
export async function registerAccount(session:RelaySession,displayName:string,handle:string) {
  enabled();
  return relayFetch<{account:RegisteredAccount}>("/v1/accounts",{
    method:"POST",session,body:{displayName,handle},
  });
}
export async function accountDevices(session:RelaySession,accountId:string){
  enabled();
  return relayFetch<{devices:LinkedDevice[]}>(route(accountId,"devices"),{session});
}
export async function createPairOffer(session:RelaySession,accountId:string){
  enabled();
  return relayFetch<{token:string;expiresAt:string}>(route(accountId,"pair-offers"),{
    session,method:"POST",body:{},
  });
}
export async function requestDevicePairing(session:RelaySession,accountId:string,token:string) {
  enabled();
  if(!/^[A-Za-z0-9_-]{40,90}$/.test(token))throw new Error("Invalid pairing link token.");
  return relayFetch<{requestId:string;verificationCode:string;expiresAt:string}>(
    route(accountId,"pair-requests"),{session,method:"POST",body:{token}});
}
export async function pendingDevicePairings(session:RelaySession,accountId:string){
  enabled();
  return relayFetch<{requests:PairRequest[]}>(route(accountId,"pair-requests"),{session});
}
export async function pairingRequestStatus(session:RelaySession,accountId:string,requestId:string){
  enabled();
  return relayFetch<{status:"pending"|"approved"|"expired"|"rejected"}>(
    route(accountId,"pair-requests/"+segment(requestId)+"/status"),{session});
}
export async function approveDevicePairing(
  session:RelaySession,accountId:string,requestId:string,verificationCode:string,
){
  enabled();
  if(!/^[0-9]{6}$/.test(verificationCode))
    throw new Error("Enter the six-digit code displayed on the other device.");
  const endpoint=route(accountId,"pair-requests/"+segment(requestId));
  const fresh=await relayFetch<{challenge:string}>(endpoint+"/challenge",{
    session,method:"POST",body:{},
  });
  const proof=await signDeviceChallenge(fresh.challenge,relayOrigin);
  if(proof.deviceId!==session.deviceId)throw new Error("Owner device identity changed.");
  return relayFetch<{status:"approved";memberDeviceId:string}>(endpoint+"/approve",{
    session,method:"POST",body:{verificationCode,proof},
  });
}
export async function revokeLinkedDevice(session:RelaySession,accountId:string,deviceId:string) {
  enabled();
  return relayFetch<{revoked:boolean}>(route(accountId,"devices/"+segment(deviceId)+"/revoke"),{
    session,method:"POST",body:{},
  });
}
