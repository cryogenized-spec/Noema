"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useAgentStore } from "@/store/agent-store";
import { useLockboxStore } from "@/store/lockbox-store";
import { normalizeAgentRoles } from "@/lib/agents/role-routing";
import { readOpenAIStream } from "@/lib/ai/openai-sse";
import { getOrCreateDeviceIdentity } from "@/lib/security/device-identity";
import { ContactQrCode } from "@/components/contact/contact-qr-code";
import {
  ensureRelaySession, relayAvailable, relayFetch, relayGetIdentity, relayGetMessages, relayGetPolicy,
  relayGetThreads, relayPostMessage, relaySetPolicy, relaySetThreadReception,
  type ReceptionPolicy, type RelayMessage, type RelaySession, type RelayThread,
} from "@/lib/network/relay-client";
import {
  decryptContactMessage, encryptContactMessage, newContactKeyId, newContactSecret,
  saveContactSecret, secretFromHash,
} from "@/lib/network/contact-crypto";

const field="min-w-0 w-full rounded-lg border border-noema-border bg-black px-3 py-2.5 text-sm text-white placeholder:text-neutral-600";
const button="min-h-10 rounded-lg border border-noema-border bg-black/50 px-3 py-2 text-xs text-neutral-200 disabled:opacity-40";
const primary="min-h-10 rounded-lg bg-noema-lime px-3 py-2 text-xs font-bold text-black disabled:opacity-40";
const randomAlias=()=>{
  const names=["Silver Circuit","Quiet Finch","Violet Atlas","Moss Lantern","Amber Star","Nova Orchard"];
  return names[crypto.getRandomValues(new Uint32Array(1))[0]%names.length];
};
const clientId=()=> "message-" + crypto.randomUUID().replace(/-/g,"");
const errText=(error:unknown)=>error instanceof Error?error.message:"Unspecified network error.";
interface DecryptedMessage extends RelayMessage { text:string; }
type PendingGuestMessage={threadId:string;message:RelayMessage};

export function SecureContact({ inviteToken }: { inviteToken?:string }) {
  const {agents,hydrateAgents}=useAgentStore();
  const {records,hydrate:hydrateVault,unlocked,revealKey}=useLockboxStore();
  const [session,setSession]=useState<RelaySession|null>(null);
  const [isOwner,setIsOwner]=useState(false);
  const [deviceId,setDeviceId]=useState("");
  const [policy,setPolicy]=useState<ReceptionPolicy|null>(null);
  const [threads,setThreads]=useState<RelayThread[]>([]);
  const [lastChecked,setLastChecked]=useState("");
  const [newThreadIds,setNewThreadIds]=useState<string[]>([]);
  const [selected,setSelected]=useState("");
  const [messages,setMessages]=useState<DecryptedMessage[]>([]);
  const [alias,setAlias]=useState("");
  const [inviteSecret,setInviteSecret]=useState("");
  const [inviteUrl,setInviteUrl]=useState("");
  const [joined,setJoined]=useState(false);
  const [draft,setDraft]=useState("");
  const [note,setNote]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [answering,setAnswering]=useState(false);
  const [stopped,setStopped]=useState(false);
  const working=useRef(false);
  const busyAgent=useRef(false);
  const seenRef=useRef(new Set<string>());
  const pendingSend=useRef<{threadId:string;text:string;id:string;ciphertext:string}|null>(null);
  const alive=useRef(true);
  const abort=useRef<AbortController|null>(null);
  const selectedRef=useRef("");
  const sessionRef=useRef<RelaySession|null>(null);
  const threadsRef=useRef<RelayThread[]>([]);
  const contactsLoaded=useRef(false);
  const policyRef=useRef<ReceptionPolicy|null>(null);
  const readyToPoll=useRef(false);

  const receptionist=useMemo(()=>agents.find(agent=>
    normalizeAgentRoles(agent.roleAssignments).includes("primary")),[agents]);
  const active=threads.find(t=>t.id===selected);
  const ownerThread=!!session && active?.owner===session.deviceId;

  useEffect(()=>{selectedRef.current=selected;},[selected]);
  useEffect(()=>{sessionRef.current=session;},[session]);
  useEffect(()=>{threadsRef.current=threads;},[threads]);
  useEffect(()=>{policyRef.current=policy;},[policy]);

  useEffect(()=>{
    alive.current=true;
    hydrateAgents(); hydrateVault();
    if(inviteToken) setInviteSecret(secretFromHash(window.location.hash));
    void getOrCreateDeviceIdentity().then(identity=>{
      if(alive.current)setDeviceId(identity.deviceId);
    }).catch(e=>{if(alive.current)setError(errText(e));});
    if(!relayAvailable)return;
    void ensureRelaySession().then(async current=>{
      if(!alive.current)return;
      setSession(current);
      const identity=await relayGetIdentity(current);
      if(!alive.current)return;
      setDeviceId(identity.deviceId);
      setIsOwner(identity.owner);
      if(identity.owner) {
        const response=await relayGetPolicy(current);
        if(alive.current)setPolicy(response.policy);
      }
    }).catch(e=>{if(alive.current)setError(errText(e));});
    return()=>{
      alive.current=false;
      abort.current?.abort();
      busyAgent.current=false;
    };
  },[inviteToken,hydrateAgents,hydrateVault]);

  const loadThreads=useCallback(async(current:RelaySession)=>{
    const response=await relayGetThreads(current);
    if(!alive.current)return;
    const known=new Set(threadsRef.current.map(thread=>thread.id));
    const arrived=contactsLoaded.current
      ? response.threads.filter(thread=>thread.owner===current.deviceId && !known.has(thread.id))
      : [];
    contactsLoaded.current=true;
    if(arrived.length){
      setNewThreadIds(previous=>[...new Set([...previous,...arrived.map(thread=>thread.id)])]);
      setNote(arrived.length===1
        ? "New guest contact: "+arrived[0].guestAlias
        : arrived.length+" new guest contacts joined.");
    }
    setThreads(response.threads);
    threadsRef.current=response.threads;
    setLastChecked(new Date().toLocaleTimeString());
    if((!selectedRef.current || !response.threads.some(thread=>thread.id===selectedRef.current))
        && response.threads.length && !inviteToken) {
      const id=response.threads[0].id; setSelected(id);selectedRef.current=id;
    }
  },[inviteToken]);

  const loadMessages=useCallback(async(current:RelaySession, thread:RelayThread)=>{
    const result=await relayGetMessages(current,thread.id);
    const rendered=await Promise.all(result.messages.map(async message=>{
      try{return {...message,text:await decryptContactMessage(
        thread.keyId,thread.id,message.clientMessageId,message.content)};}
      catch{return {...message,text:"[Encrypted: this browser cannot decrypt this message]"};}
    }));
    if(alive.current && selectedRef.current===thread.id)setMessages(rendered);
    return rendered;
  },[]);

  const receive=useCallback(async(current:RelaySession)=>{
    if(working.current)return;
    working.current=true;
    try{
      await loadThreads(current);
      const thread=threadsRef.current.find(t=>t.id===selectedRef.current);
      if(thread)await loadMessages(current,thread);
    }catch(e){
      if(alive.current)setError(errText(e));
    }finally{working.current=false;}
  },[loadThreads,loadMessages]);

  const processReception=useCallback(async(current:RelaySession)=>{
    const pol=policyRef.current;
    if(busyAgent.current || !pol?.enabled || stopped || document.visibilityState!=="visible" ||
       !unlocked || !receptionist || receptionist.guestVisibility!=="invited" ||
       receptionist.providerId!=="openai" || !records.some(r=>r.providerId==="openai"))return;
    busyAgent.current=true;
    try{
      const response=await relayFetch<{pending:PendingGuestMessage[]}>("/v1/reception/pending",{session:current});
      const item=response.pending.find(p=>!seenRef.current.has(p.message.id));
      if(!item)return;
      const thread=threadsRef.current.find(t=>t.id===item.threadId);
      if(!thread || !thread.receptionEnabled)return;
      // Ensure the encrypted source really belongs to this browser's stored key.
      const plaintext=await decryptContactMessage(thread.keyId,thread.id,
        item.message.clientMessageId,item.message.content);
      if(!plaintext.trim())return;
      const apiKey=await revealKey("openai"); // Unlock before billable claim.
      const model=receptionist.modelId;
      if(!/^gpt-[a-z0-9.-]{1,65}$/i.test(model))
        throw new Error("Receptionist must use an approved OpenAI GPT model.");
      const history=await relayGetMessages(current,thread.id);
      const bounded=await Promise.all(history.messages
        .filter(m=>m.seq<=item.message.seq).slice(-6)
        .map(async m=>({
          role:m.sender==="guest"?"user":"assistant",
          content:(await decryptContactMessage(thread.keyId,thread.id,m.clientMessageId,m.content)).slice(0,1800),
        })));
      const claim=await relayFetch<{claimToken:string}>(
        "/v1/threads/"+thread.id+"/agent-claim",
        {session:current,method:"POST",body:{seq:item.message.seq}});
      seenRef.current.add(item.message.id);
      if(!alive.current || document.visibilityState!=="visible" || !policyRef.current?.enabled)return;
      const controller=new AbortController();abort.current=controller;
      setAnswering(true);
      const responseAI=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",signal:controller.signal,cache:"no-store",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
        body:JSON.stringify({
          model,store:false,stream:true,tools:[],max_output_tokens:Math.min(384,
            Math.max(128,receptionist.generationSettings.max_output_tokens||384)),
          instructions:(
            "You are an AI receptionist, never a human. State clearly you are an AI when responding. "+
            "Answer only the guest's message; avoid revealing owner or other thread information. "+
            "Do not claim to have performed actions or used MCP tools. Offer human handoff if needed.\n"+
            (receptionist.baseSystemPrompt||"Be helpful, professional and concise.").slice(0,1400)+"\n"+
            (receptionist.speechStyle||"").slice(0,400)
          ),
          input:bounded,
        }),
      });
      if(!responseAI.ok || !responseAI.body)
        throw new Error("OpenAI rejected the direct browser reception request (HTTP "+responseAI.status+").");
      const reply=(await readOpenAIStream(responseAI.body,async()=>{})).trim().slice(0,2200);
      if(!reply || !alive.current || controller.signal.aborted ||
         !policyRef.current?.enabled || document.visibilityState!=="visible")return;
      const id="agent-reply-"+item.message.seq.toString().padStart(10,"0")+"-"+thread.id.slice(0,12);
      const encrypted=await encryptContactMessage(thread.keyId,thread.id,id,reply);
      await relayPostMessage(current,thread.id,encrypted,id,true,{
        sourceSeq:item.message.seq,claimToken:claim.claimToken,
      });
      if(selectedRef.current===thread.id)await loadMessages(current,thread);
      if(alive.current)setNote("AI receptionist responded to a permitted guest conversation.");
    }catch(e) {
      if(alive.current)setError("Reception paused: "+errText(e)+
        " The reserved invocation counts toward its daily limit, even if the provider failed.");
      // The relay's one-time claim prevents retries from causing surprise billing.
    }finally{
      abort.current=null;busyAgent.current=false;
      if(alive.current)setAnswering(false);
    }
  },[receptionist,unlocked,stopped,records,revealKey,loadMessages]);

  useEffect(()=>{
    if(!session || (!!inviteToken && !joined))return;
    readyToPoll.current=true;
    const tick=async()=>{
      if(!alive.current || document.visibilityState!=="visible" || !readyToPoll.current)return;
      await receive(session);
      if(isOwner) await processReception(session);
    };
    void tick();
    const timer=window.setInterval(()=>{void tick();},5000);
    const onForeground=()=>{if(document.visibilityState==="visible")void tick();};
    window.addEventListener("focus",onForeground);
    document.addEventListener("visibilitychange",onForeground);
    return()=>{
      readyToPoll.current=false;
      window.clearInterval(timer);
      window.removeEventListener("focus",onForeground);
      document.removeEventListener("visibilitychange",onForeground);
      abort.current?.abort();
    };
  },[session,joined,inviteToken,isOwner,receive,processReception]);

  const action=async(fn:()=>Promise<void>)=>{
    if(busy)return;
    setBusy(true);setError("");setNote("");
    try{await fn();}catch(e){setError(errText(e));}finally{setBusy(false);}
  };
  const createInvite=()=>action(async()=>{
    if(!session || !isOwner)throw new Error("Only the configured owner can create invitations.");
    const secret=newContactSecret(),keyId=newContactKeyId();
    // Persist locally first, so no server-side invite is issued without the key.
    await saveContactSecret(keyId,secret);
    const response=await relayFetch<{token:string;keyId:string;expiresAt:string}>("/v1/invites",{
      session,method:"POST",body:{alias:alias||"NOEMA Contact",keyId},
    });
    setInviteUrl(window.location.origin+"/invite/"+response.token+"#k="+secret);
    setNote("Single-use invite ready. The link contains its decryption secret: share it privately.");
  });
  const redeem=()=>action(async()=>{
    if(!session || !inviteToken || !inviteSecret)
      throw new Error("This invite is missing its private encryption key. Request a fresh complete link.");
    const response=await relayFetch<{thread:RelayThread}>("/v1/invites/redeem",{
      session,method:"POST",body:{token:inviteToken,alias:alias.trim()||randomAlias()},
    });
    await saveContactSecret(response.thread.keyId,inviteSecret);
    setThreads(current=>[response.thread,...current]);
    setSelected(response.thread.id);selectedRef.current=response.thread.id;
    setJoined(true);setInviteSecret("");
    window.history.replaceState(null,"","/connect");
    setNote("Joined. Your first message will be encrypted before delivery.");
  });
  const send=()=>action(async()=>{
    if(!session || !active || !draft.trim())return;
    const text=draft.trim();
    const existing=pendingSend.current;
    const attempt=existing?.threadId===active.id && existing.text===text ? existing : null;
    const id=attempt?.id || clientId();
    // One ciphertext is generated once and reused for uncertain network retries:
    // idempotency and AES-GCM authenticated data must refer to the SAME client ID.
    const ciphertext=attempt?.ciphertext ||
      await encryptContactMessage(active.keyId,active.id,id,text);
    pendingSend.current={threadId:active.id,text,id,ciphertext};
    await relayPostMessage(session,active.id,ciphertext,id);
    pendingSend.current=null;setDraft("");
    await loadMessages(session,active);
    setNote("Encrypted message delivered to the relay.");
  });
  const switchGlobal=()=>action(async()=>{
    if(!session || !isOwner || !policy)return;
    const next=!policy.enabled;
    if(next && (!receptionist || receptionist.guestVisibility!=="invited" ||
      receptionist.providerId!=="openai" ||
      !window.confirm("Enable AI Reception? Only conversations separately opted in may use your unlocked OpenAI key, up to "+
        policy.maxDailyCalls+" attempts per UTC day. The owner PWA must remain open and visible. No MCP tools are allowed.")))return;
    abort.current?.abort();
    const result=await relaySetPolicy(session,{
      enabled:next,maxDailyCalls:policy.maxDailyCalls,maxThreadCalls:policy.maxThreadCalls});
    policyRef.current=result.policy;setPolicy(result.policy);
    if(!next)setStopped(true);else setStopped(false);
    setNote(next?"Owner reception enabled. Each thread still requires separate approval.":"Reception disabled globally.");
  });
  const switchThread=()=>action(async()=>{
    if(!session || !active || !ownerThread)return;
    const next=!active.receptionEnabled;
    if(next && !window.confirm("Allow this guest conversation to receive billable AI replies to NEW messages only?"))return;
    const result=await relaySetThreadReception(session,active.id,next);
    setThreads(current=>current.map(t=>t.id===active.id?result.thread:t));
    threadsRef.current=threadsRef.current.map(t=>t.id===active.id?result.thread:t);
    if(!next)abort.current?.abort();
    setNote(next?"Enabled AI reception for future messages in this conversation.":"AI reception disabled for this conversation.");
  });
  const changeBudget=(key:"maxDailyCalls"|"maxThreadCalls",value:number)=>action(async()=>{
    if(!session || !isOwner || !policy)return;
    const response=await relaySetPolicy(session,{
      enabled:policy.enabled,
      maxDailyCalls:key==="maxDailyCalls"?value:policy.maxDailyCalls,
      maxThreadCalls:key==="maxThreadCalls"?value:policy.maxThreadCalls,
    });
    policyRef.current=response.policy;setPolicy(response.policy);
    setNote("Reception attempt ceiling saved on the relay.");
  });

  if(!relayAvailable) return <main className="mx-auto max-w-[700px] p-5 text-white">
    <Link href="/share" className="text-xs text-noema-lime">← Contact settings</Link>
    <h1 className="mt-5 text-lg font-semibold">Secure contact bridge</h1>
    <p className="mt-3 rounded-lg border border-noema-gold/40 bg-[#1b1712] p-4 text-sm leading-6 text-neutral-300">
      Cloudflare relay is not configured for this PWA deployment. No invitation can be issued or redeemed.
      Set NEXT_PUBLIC_NOEMA_RELAY_URL to an approved Worker HTTPS origin after owner-device setup.
      The existing invitation demo remains separate and non-networked.
    </p>
    <section className="mt-3 rounded-lg border border-noema-border p-3">
      <h2 className="mb-2 text-sm font-semibold">Your signed device identifier</h2>
      <p className="mb-2 text-xs leading-5 text-neutral-400">
        Use a stable HTTPS PWA domain first; browser identity is specific to its origin.
        This device ID is public identity metadata, not an API key. Enter it as
        OWNER_DEVICE_ID in your private Cloudflare Worker configuration.
      </p>
      <p className="break-all font-mono text-[11px] text-noema-lime">{deviceId||"Generating secure browser identity…"}</p>
      {deviceId&&<button type="button" className={button+" mt-3"}
        onClick={()=>void navigator.clipboard.writeText(deviceId).then(()=>setNote("Device ID copied."))}>
        Copy device ID
      </button>}
      {note&&<p className="mt-2 text-xs text-noema-lime">{note}</p>}
    </section>
  </main>;

  return <main className="mx-auto flex h-dvh max-w-[710px] flex-col gap-3 overflow-hidden bg-[#09090b] p-3 text-white sm:p-5">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-noema-border pb-3">
      <Link href="/" className="text-xs text-noema-lime">← Workspace</Link>
      <strong className="text-sm">Encrypted contact</strong>
      <span className="text-[10px] text-neutral-400">{session?isOwner?"Owner":"Guest":"Connecting…"}</span>
    </header>
    <p className="shrink-0 text-[11px] leading-5 text-neutral-400">
      Invite-key AES-GCM encryption · 5-second visible-tab polling · no server-side model calls · not independently audited
    </p>
    {error&&<p role="alert" className="shrink-0 rounded-lg border border-rose-600/30 bg-rose-950/20 p-2 text-xs text-rose-200">{error}</p>}
    {!session&&deviceId&&<div className="shrink-0 rounded-lg border border-noema-lime/20 bg-[#101612] p-3">
      <p className="text-xs font-semibold text-noema-lime">Owner device registration</p>
      <p className="mt-1 text-[11px] leading-5 text-neutral-400">
        The relay is locked until the owner registers this staging browser identity.
        The ID below is public device identity metadata, not a private key.
      </p>
      <p className="mt-2 break-all font-mono text-[11px] text-neutral-200">{deviceId}</p>
      <button type="button" className={button+" mt-2"}
        onClick={()=>void navigator.clipboard.writeText(deviceId).then(()=>setNote("Device ID copied."))}>
        Copy device ID
      </button>
    </div>}
    {note&&<p role="status" className="shrink-0 rounded-lg border border-noema-lime/30 p-2 text-xs text-noema-lime">{note}</p>}
    {inviteToken&&!joined ? <section className="space-y-3 rounded-xl border border-noema-border bg-[#111113] p-4">
      <h1 className="text-lg font-semibold">Accept private invitation</h1>
      <p className="text-xs text-neutral-400">Only pressing Continue redeems this invitation. Opening or previewing the link never wakes an agent.</p>
      {!inviteSecret&&<p className="text-xs text-rose-300">The encryption key is missing from the link. Do not redeem this invitation.</p>}
      <input className={field} maxLength={32} placeholder="Choose a display name (optional)" value={alias}
        onChange={e=>setAlias(e.target.value)} />
      <button type="button" className={button} onClick={()=>setAlias(randomAlias())}>Random alias</button>
      <button type="button" className={primary+" w-full"} disabled={!session||!inviteSecret||busy}
        onClick={()=>void redeem()}>Continue anonymously</button>
    </section> : <>
      {isOwner&&<section className="shrink-0 space-y-2 rounded-xl border border-noema-border bg-[#111113] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Reception · {receptionist?.name||"No red agent assigned"}</span>
          <button type="button" disabled={!session||!policy||busy}
            className={policy?.enabled?primary:button} onClick={()=>void switchGlobal()}>
            Global {policy?.enabled?"ON":"OFF"}
          </button>
        </div>
        <p className="text-[11px] leading-4 text-neutral-500">Requires a red agent set to Invited in AI Studio, an unlocked API Lockbox and a visible owner browser tab. No MCP access.</p>
        {policy&&<div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-neutral-400">Daily attempts (max 8)
            <select className={field+" mt-1"} value={policy.maxDailyCalls} disabled={busy}
              onChange={e=>void changeBudget("maxDailyCalls",Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-neutral-400">Per conversation (max 3)
            <select className={field+" mt-1"} value={policy.maxThreadCalls} disabled={busy}
              onChange={e=>void changeBudget("maxThreadCalls",Number(e.target.value))}>
              {[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>}
      </section>}
      {isOwner&&<section className="shrink-0 space-y-2 rounded-lg border border-noema-border p-3">
        <div className="flex gap-2">
          <input className={field} maxLength={32} placeholder="Inviter alias" value={alias} onChange={e=>setAlias(e.target.value)} />
          <button type="button" className={primary+" shrink-0"} disabled={busy||!session}
            onClick={()=>void createInvite()}>New invite</button>
        </div>
        {inviteUrl&&<div className="flex flex-col gap-2">
          <ContactQrCode value={inviteUrl} label="Encrypted NOEMA contact invitation" />
          <p className="break-all text-[11px] text-neutral-400">{inviteUrl}</p>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className={button}
              onClick={()=>void navigator.clipboard.writeText(inviteUrl).then(()=>setNote("Invite copied. Send the complete link privately."))}>
              Copy link
            </button>
            <a href={"https://wa.me/?text="+encodeURIComponent("Chat privately with me on NOEMA: "+inviteUrl)}
              className={button+" flex items-center justify-center"} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <button type="button" className={button+" text-rose-300"}
              onClick={()=>void action(async()=>{
                if(!session)throw Error("Owner sign-in required.");
                const token=new URL(inviteUrl).pathname.split("/").at(-1);
                if(!token)throw Error("Invalid invitation URL.");
                await relayFetch("/v1/invites/revoke",{session,method:"POST",body:{token}});
                setInviteUrl("");setNote("Unredeemed invitation revoked.");
              })}>
              Revoke
            </button>
          </div>
        </div>}
      </section>}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-white">
              {isOwner ? "Guest contacts" : "Conversations"} · {threads.length}
              {newThreadIds.length>0 && <span className="ml-2 rounded bg-noema-lime px-1.5 py-0.5 text-[10px] text-black">
                {newThreadIds.length} new
              </span>}
            </h2>
            <p className="text-[10px] text-neutral-500">
              {lastChecked ? "Last checked "+lastChecked : "Checking the encrypted relay…"}
            </p>
          </div>
          <button type="button" disabled={!session} onClick={()=>{if(session)void receive(session);}}
            className={button+" shrink-0"} aria-label="Refresh encrypted contacts">
            <Icon icon="solar:refresh-linear" className="mr-1 inline" aria-hidden="true" />
            Refresh
          </button>
        </div>
        {isOwner && <p className="shrink-0 px-1 text-[11px] leading-4 text-neutral-400">
          New guest messages appear here in Contact inbox, not the separate local AI Chat.
          The inbox checks for arrivals every five seconds while this tab is visible.
        </p>}
        <div className="max-h-32 shrink-0 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {threads.map(thread=><button type="button" key={thread.id}
              className={"flex min-h-9 max-w-[190px] items-center gap-1.5 rounded-lg border px-3 text-xs "+
                (selected===thread.id?"border-noema-lime text-noema-lime":"border-noema-border text-neutral-400")}
              onClick={()=>{
                setSelected(thread.id);selectedRef.current=thread.id;
                setNewThreadIds(current=>current.filter(id=>id!==thread.id));
                setMessages([]);setError("");
              }}>
              <span className="truncate">{thread.owner===session?.deviceId?thread.guestAlias:thread.ownerAlias}</span>
              {newThreadIds.includes(thread.id)&&
                <span className="shrink-0 rounded bg-noema-lime px-1 text-[9px] font-semibold text-black">NEW</span>}
            </button>)}
          </div>
        </div>
        {active?<section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-noema-border bg-[#111113]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-noema-border p-3">
            <p className="truncate text-xs font-semibold">{ownerThread?active.guestAlias:active.ownerAlias}</p>
            {ownerThread?<button type="button" disabled={busy||!session}
              onClick={()=>void switchThread()} className={active.receptionEnabled?primary:button}>
              Thread AI {active.receptionEnabled?"ON":"OFF"}
            </button>:active.receptionEnabled&&<span className="text-[10px] text-noema-violet">AI may answer · disclosed</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
            {messages.map(msg=><div key={msg.id}
              className={"w-fit max-w-[92%] rounded-lg border p-3 text-xs leading-5 "+
                ((ownerThread?msg.sender!=="guest":msg.sender==="guest")
                  ?"ml-auto border-noema-lime/30 bg-[#1b291c]":"border-noema-border bg-black/40")}>
              {msg.sender==="agent"&&<p className="mb-1 text-[10px] font-semibold text-noema-violet">
                <Icon icon="solar:cpu-bolt-bold" className="mr-1 inline" aria-hidden="true" />
                AI RECEPTION · {receptionist?.name||"NOEMA"}
              </p>}
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              <p className="mt-1 text-right text-[10px] text-neutral-600">{new Date(msg.createdAt).toLocaleTimeString()}</p>
            </div>)}
            {answering&&<p className="text-xs text-noema-violet">AI processing in this owner tab…</p>}
          </div>
          <div className="flex shrink-0 items-end gap-2 border-t border-noema-border p-2">
            <textarea className={field} rows={2} maxLength={3000} value={draft}
              placeholder="Type an encrypted message…" aria-label="Encrypted message"
              onChange={e=>setDraft(e.target.value)} />
            <button type="button" className={primary} disabled={!draft.trim()||busy||!session}
              onClick={()=>void send()}>Send</button>
          </div>
        </section>:<p className="p-5 text-center text-xs text-neutral-500">
          {isOwner?"No guests yet. Use New invite above, and ask the guest to choose Continue anonymously and send a message.":"No conversations yet."}
        </p>}
      </div>
      {isOwner&&deviceId&&<p className="shrink-0 break-all text-[10px] text-neutral-600">
        Owner device ID for Cloudflare OWNER_DEVICE_ID setup: {deviceId}
      </p>}
    </>}
  </main>;
}
