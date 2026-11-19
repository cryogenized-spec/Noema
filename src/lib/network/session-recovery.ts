/** Noema sessions are bound to one non-extractable browser device key.
 * Only reuse a cached token if it belongs to the same signed device.
 */
export interface DeviceBoundSession {deviceId:string;token:string}
export function sameDeviceSession<T extends DeviceBoundSession>(
  requested:T|undefined,cached:T|null,
):T|undefined {
  if(!requested)return undefined;
  return cached?.deviceId===requested.deviceId?cached:requested;
}
export function newerSameDeviceSession<T extends DeviceBoundSession>(
  attempted:T|undefined,cached:T|null,
):T|null {
  return attempted && cached?.deviceId===attempted.deviceId &&
    cached.token!==attempted.token?cached:null;
}
export function mayRenewRelayAuth(status:number,hasSession:boolean,retried:boolean,aborted:boolean):boolean {
  return status===401 && hasSession && !retried && !aborted;
}
