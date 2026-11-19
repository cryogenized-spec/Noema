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
/** Concurrent 401 responses share one signed-challenge renewal, and a failed
 * renewal is not cached indefinitely. */
export function singleFlight<T>(run:()=>Promise<T>):()=>Promise<T>{
  let pending:Promise<T>|null=null;
  return ()=>{
    if(!pending)pending=Promise.resolve().then(run).finally(()=>{pending=null;});
    return pending;
  };
}
