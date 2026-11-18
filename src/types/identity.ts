/** A browser-local registration *draft*, not a network account or membership. */
export type RegistrationIntent = "independent" | "join-existing";
export interface LocalIdentityDraft {
  id: "self";
  displayName: string;
  handle: string;
  deviceLabel: string;
  intent: RegistrationIntent;
  createdAt: string;
  updatedAt: string;
}
/** Proposed future server membership claims. Not yet recognised by the live relay. */
export type AccountDeviceStatus = "pending" | "active" | "revoked";
export type AccountDeviceRole = "owner" | "member";
export interface AccountDeviceMembership {
  accountId: string;
  deviceId: string;
  status: AccountDeviceStatus;
  role: AccountDeviceRole;
  approvedAt: string | null;
}
