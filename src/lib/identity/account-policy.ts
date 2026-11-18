import type { AccountDeviceMembership, LocalIdentityDraft, RegistrationIntent } from "@/types/identity";

const maxLength=(input:unknown, length:number):string =>
  typeof input==="string" ? input.trim().replace(/\s+/g," ").slice(0,length) : "";

export function validHandle(value:string):boolean {
  return /^[a-z][a-z0-9_]{2,23}$/.test(value);
}
export function normalizeIdentityDraft(raw:Partial<LocalIdentityDraft>|null):LocalIdentityDraft {
  const now=new Date().toISOString();
  const handle=maxLength(raw?.handle,24).toLowerCase().replace(/^@/,"");
  const intent:RegistrationIntent=raw?.intent==="join-existing"?"join-existing":"independent";
  return {
    id:"self",
    displayName:maxLength(raw?.displayName,50),
    handle:validHandle(handle)?handle:"",
    deviceLabel:maxLength(raw?.deviceLabel,40),
    intent,
    createdAt:typeof raw?.createdAt==="string"&&Number.isFinite(Date.parse(raw.createdAt))?raw.createdAt:now,
    updatedAt:typeof raw?.updatedAt==="string"&&Number.isFinite(Date.parse(raw.updatedAt))?raw.updatedAt:now,
  };
}

/** Future server permission rules: a local label, device ID, public key, or
 * self-declared role cannot confer account ownership. Membership must be
 * verified server-side and bound to the authenticated, signed device.
 */
export function hasAccountPermission(
  membership:AccountDeviceMembership|null|undefined,
  authenticatedDeviceId:string,
  accountId:string,
  action:"read"|"message"|"pair"|"revoke"|"manage-agents",
):boolean {
  if(!membership || !authenticatedDeviceId || !accountId ||
    membership.deviceId!==authenticatedDeviceId || membership.accountId!==accountId ||
    membership.status!=="active" || !membership.approvedAt || !Number.isFinite(Date.parse(membership.approvedAt)))
    return false;
  if(action==="read"||action==="message")return true;
  return membership.role==="owner";
}
export function canApprovePairing(
  current:AccountDeviceMembership|null|undefined,
  authenticatedDeviceId:string,
  proposed:AccountDeviceMembership,
):boolean {
  return hasAccountPermission(current,authenticatedDeviceId,proposed.accountId,"pair") &&
    proposed.status==="pending" && proposed.role==="member" &&
    proposed.deviceId!==authenticatedDeviceId && proposed.approvedAt===null;
}
