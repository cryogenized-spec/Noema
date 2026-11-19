"use client";

import {relayFetch,relayAvailable,type RelaySession} from "@/lib/network/relay-client";

export interface PushConfiguration {
  available:boolean; publicKey:string|null; enabled:boolean; scope:"owner"|"guest";
}
export function canUseWebPush():boolean {
  return typeof window!=="undefined" &&
    window.isSecureContext && "Notification" in window &&
    "serviceWorker" in navigator && "PushManager" in window;
}
export function publicPushKeyBytes(key:string):Uint8Array<ArrayBuffer>{
  if(!/^[A-Za-z0-9_-]{80,100}$/.test(key))throw Error("Invalid push server key.");
  const binary=atob(key.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-key.length%4)%4));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  if(bytes.length!==65 || bytes[0]!==4)throw Error("Invalid push server key.");
  return bytes;
}
export async function readPushConfig(session:RelaySession):Promise<PushConfiguration>{
  if(!relayAvailable)throw Error("Messaging relay unavailable.");
  return relayFetch<PushConfiguration>("/v1/push/config",{session});
}
export async function subscribeToNoemaPush(session:RelaySession,publicKey:string) {
  if(!canUseWebPush())throw Error("Web Push is unavailable on this device.");
  const serverKey=publicPushKeyBytes(publicKey);
  // Permission must be requested by the click handler before awaiting network.
  const registration=await navigator.serviceWorker.register("/noema-push-sw.js",{scope:"/"});
  let subscription=await registration.pushManager.getSubscription();
  if(subscription){
    const current=new Uint8Array(subscription.options.applicationServerKey??new ArrayBuffer(0));
    if(current.length!==serverKey.length || current.some((byte,i)=>byte!==serverKey[i])){
      await subscription.unsubscribe();
      subscription=null;
    }
  }
  if(!subscription)subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:serverKey,
  });
  try{
    await relayFetch("/v1/push/subscribe",{
      session,method:"POST",body:{subscription:subscription.toJSON()},
    });
  }catch(error){
    // Do not leave a browser subscription unexpectedly active after relay denial.
    await subscription.unsubscribe().catch(()=>{});
    throw error;
  }
}
export async function unsubscribeFromNoemaPush(session:RelaySession) {
  // Server-side revocation takes effect even when the browser API later fails.
  await relayFetch("/v1/push/unsubscribe",{session,method:"POST",body:{}});
  if(!canUseWebPush())return;
  const registration=await navigator.serviceWorker.getRegistration("/");
  const sub=await registration?.pushManager.getSubscription();
  if(sub)await sub.unsubscribe();
}
