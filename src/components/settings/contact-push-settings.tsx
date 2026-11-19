"use client";

import {useEffect,useState} from "react";
import {
  ensureRelaySession,relayAvailable,type RelaySession,
} from "@/lib/network/relay-client";
import {
  canUseWebPush,readPushConfig,subscribeToNoemaPush,unsubscribeFromNoemaPush,
  type PushConfiguration,
} from "@/lib/network/push-client";

/** No automatic permission prompts. Hidden entirely when unsupported or
 * when Cloudflare has no configured notification sender. */
export function ContactPushSettings(){
  const [session,setSession]=useState<RelaySession|null>(null);
  const [config,setConfig]=useState<PushConfiguration|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [supported,setSupported]=useState(false);
  useEffect(()=>{
    setSupported(canUseWebPush());
    if(!relayAvailable || !canUseWebPush())return;
    let live=true;
    void ensureRelaySession().then(async current=>{
      const settings=await readPushConfig(current);
      if(live){setSession(current);setConfig(settings);}
    }).catch(()=>{
      // Connection failure is not a prompt for the user to enable anything.
    });
    return()=>{live=false;};
  },[]);
  if(!supported || !relayAvailable || !config?.available || !session)return null;
  const active=config.enabled && Notification.permission==="granted";
  const toggle=async()=>{
    setBusy(true);setError("");
    try{
      if(active)await unsubscribeFromNoemaPush(session);
      else{
        // Direct click gesture: do not await network or other work before this.
        const permission=await Notification.requestPermission();
        if(permission!=="granted")throw Error("Notification permission was not granted.");
        const fresh=await readPushConfig(session);
        if(!fresh.available || !fresh.publicKey)throw Error("Notifications are unavailable.");
        await subscribeToNoemaPush(session,fresh.publicKey);
      }
      setConfig(await readPushConfig(session));
    }catch(e){setError(e instanceof Error?e.message:"Cannot change notifications.");}
    finally{setBusy(false);}
  };
  return (
    <section aria-label="Contact notifications" className="rounded-xl border border-noema-border bg-[#111113] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Message notifications</h2>
          <p className="mt-1 text-xs text-neutral-400">Generic alerts only. Message text stays private.</p>
        </div>
        <button type="button" disabled={busy} onClick={()=>void toggle()}
          aria-pressed={active}
          className={"min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 "+
            (active?"border border-noema-border text-neutral-100":"bg-noema-lime text-black")}>
          {busy?"Saving…":active?"Disable":"Enable"}
        </button>
      </div>
      {error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    </section>
  );
}
