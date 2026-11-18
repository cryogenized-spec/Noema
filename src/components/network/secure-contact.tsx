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
import { makePublicGuestInvite } from "@/lib/network/public-guest-link";
import {
  ensureRelaySession, relayAvailable, relayFetch, relayGetIdentity, relayGetMessages, relayGetPolicy,
  relayGetThreads, relayPostMessage, relaySetPolicy, relaySetThreadReception,
  type ReceptionPolicy, type RelayMessage, type RelaySession, type RelayThread,
} from "@/lib/network/relay-client";
import {
  decryptContactMessage, encryptContactMessage, newContactKeyId, newContactSecret,
  saveContactSecret, secretFromHash,
} from "@/lib/network/contact-crypto";
import {latestIncomingSequence, markIncomingRead} from "@/lib/network/contact-unread";

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
  const [ownerSection,setOwnerSection]=useState<"inbox"|"invites"|"reception">("inbox");
  const [newThreadIds,setNewThreadIds]=useState<string[]>([]);
  const [selected,setSelected]=useState("");
  const [mobileContactsOpen,setMobileContactsOpen]=useState(true);
  const [messages,setMessages]=useState<DecryptedMessage[]>([]);
  const [alias,setAlias]=useState("");
  const [inviteSecret,setInviteSecret]=useState("");
  const [inviteUrl,setInviteUrl]=useState("");
  const [joined,setJoined]=useState(false);
  // Unsent text belongs to a particular conversation, not the shared composer.
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const draft=drafts[selected]??"";
  const [note,setNote]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [answering,setAnswering]=useState(false);
  const [stopped,setStopped]=useState(false);
  const working=useRef(false);
  const busyAgent=useRef(false);
  const seenRef=useRef(new Set<string>());
  const pendingSend=useRef(new Map<string,{text:string;id:string;ciphertext:string}>());
  const messageLoadSequence=useRef(0);
  const alive=useRef(true);
  const abort=useRef<AbortController|null>(null);
  const selectedRef=useRef("");
  const sessionRef=useRef<RelaySession|null>(null);
  const threadsRef=useRef<RelayThread[]>([]);
  const contactsLoaded=useRef(false);
  const policyRef=useRef<ReceptionPolicy|null>(null);
  const readyToPoll=useRef(false);
  const ownerSectionRef=useRef(ownerSection);
  const mobileContactsRef=useRef(true);

  const receptionist=useMemo(()=>agents.find(agent=>
    normalizeAgentRoles(agent.roleAssignments).includes("primary")),[agents]);
  const active=threads.find(t=>t.id===selected);
  const ownerThread=!!session && active?.owner===session.deviceId;

  useEffect(()=>{selectedRef.current=selected;},[selected]);
  useEffect(()=>{sessionRef.current=session;},[session]);
  useEffect(()=>{threadsRef.current=threads;},[threads]);
  useEffect(()=>{policyRef.current=policy;},[policy]);
  useEffect(()=>{ownerSectionRef.current=ownerSection;},[ownerSection]);
  useEffect(()=>{mobileContactsRef.current=mobileContactsOpen;},[mobileContactsOpen]);

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
    if((!selectedRef.current || !response.threads.some(thread=>thread.id===selectedRef.current))
        && response.threads.length && !inviteToken) {
      const id=response.threads[0].id;
      messageLoadSequence.current++;
      setSelected(id);selectedRef.current=id;
    }
  },[inviteToken]);

  const loadMessages=useCallback(async(current:RelaySession, thread:RelayThread)=>{
    const requestId=++messageLoadSequence.current;
    const result=await relayGetMessages(current,thread.id);
    const rendered=await Promise.all(result.messages.map(async message=>{
      try{return {...message,text:await decryptContactMessage(
        thread.keyId,thread.id,message.clientMessageId,message.content)};}
      catch{return {...message,text:"[Encrypted: this browser cannot decrypt this message]"};}
    }));
    if(alive.current && selectedRef.current===thread.id &&
       requestId===messageLoadSequence.current) {
      setMessages(rendered);
      if(thread.owner===current.deviceId && ownerSectionRef.current==="inbox" &&
         document.visibilityState==="visible" &&
         (!window.matchMedia("(max-width: 767px)").matches || !mobileContactsRef.current))
        markIncomingRead(current.deviceId,thread.id,latestIncomingSequence(result.messages));
    }
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
    // The guest PWA has a permanent public origin. The owner app stays SSO-protected.
    const guestBase=process.env.NEXT_PUBLIC_NOEMA_GUEST_ORIGIN;
    setInviteUrl(guestBase
      ? makePublicGuestInvite(guestBase,response.token,secret)
      : window.location.origin+"/invite/"+response.token+"#k="+secret);
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
    messageLoadSequence.current++;
    setSelected(response.thread.id);selectedRef.current=response.thread.id;
    setJoined(true);setInviteSecret("");
    window.history.replaceState(null,"","/connect");
    setNote("");
  });
  const send=()=>action(async()=>{
    if(!session || !active || !draft.trim())return;
    const text=draft.trim();
    const existing=pendingSend.current.get(active.id);
    const attempt=existing?.text===text ? existing : null;
    const id=attempt?.id || clientId();
    // One ciphertext is generated once and reused for uncertain network retries:
    // idempotency and AES-GCM authenticated data must refer to the SAME client ID.
    const ciphertext=attempt?.ciphertext ||
      await encryptContactMessage(active.keyId,active.id,id,text);
    const sendingThread=active.id;
    pendingSend.current.set(sendingThread,{text,id,ciphertext});
    await relayPostMessage(session,sendingThread,ciphertext,id);
    pendingSend.current.delete(sendingThread);
    // A slow send must never erase text typed in another conversation.
    setDrafts(current=>current[sendingThread]?.trim()===text
      ? {...current,[sendingThread]:""} : current);
    if(selectedRef.current===sendingThread)await loadMessages(session,active);
    setNote("");
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

  return <main className="relative mx-auto flex h-dvh min-h-0 max-w-[910px] flex-col gap-2 overflow-hidden bg-[#09090b] px-2 py-2 text-white sm:px-4 sm:py-3">
    <header className="flex min-h-10 shrink-0 items-center gap-2 border-b border-noema-border pb-2 pr-12 sm:pr-14">
      <Link href="/" className="shrink-0 text-xs text-noema-lime" aria-label="Back to NOEMA workspace">
        <Icon icon="solar:arrow-left-linear" className="text-lg" aria-hidden="true" />
      </Link>
      <strong className="min-w-0 flex-1 truncate text-sm">Messages</strong>
      {isOwner&&<select aria-label="Contact section" className="min-h-9 max-w-[145px] rounded-lg border border-noema-border bg-[#111113] px-2 text-xs text-neutral-200"
        value={ownerSection} onChange={e=>{setOwnerSection(e.target.value as "inbox"|"invites"|"reception");setNote("");setError("");}}>
        <option value="inbox">Inbox{newThreadIds.length>0?" · "+newThreadIds.length+" new":""}</option>
        <option value="invites">Invites / QR</option>
        <option value="reception">Reception</option>
      </select>}
      <span className="shrink-0 text-[10px] text-neutral-500">{session?isOwner?"Owner":"Guest":"Connecting…"}</span>
    </header>
    {error&&<div role="alert" className="absolute bottom-20 left-3 right-3 z-30 mx-auto flex max-w-[540px] items-start gap-2 rounded-lg border border-rose-600/30 bg-[#28171a] p-2.5 text-xs text-rose-100 shadow-xl">
      <span className="min-w-0 flex-1 break-words">{error}</span>
      <button type="button" aria-label="Dismiss error" className="shrink-0 px-2 text-base" onClick={()=>setError("")}>×</button>
    </div>}
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
    {note && (inviteToken&&!joined || isOwner && ownerSection!=="inbox") &&
      <p role="status" className="shrink-0 rounded-lg border border-noema-border px-2 py-1.5 text-xs text-noema-lime">{note}</p>}
    {inviteToken&&!joined ? <section className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-noema-border bg-[#111113] p-4">
      <h1 className="text-lg font-semibold">Accept private invitation</h1>
      {!inviteSecret&&<p className="text-xs text-rose-300">The encryption key is missing from the link. Do not redeem this invitation.</p>}
      <input className={field} maxLength={32} placeholder="Choose a display name (optional)" value={alias}
        onChange={e=>setAlias(e.target.value)} />
      <button type="button" className={button} onClick={()=>setAlias(randomAlias())}>Random alias</button>
      <button type="button" className={primary+" w-full"} disabled={!session||!inviteSecret||busy}
        onClick={()=>void redeem()}>Continue anonymously</button>
    </section> : <>
      {isOwner&&ownerSection==="reception"&&<section className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-noema-border bg-[#111113] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Reception · {receptionist?.name||"No red agent assigned"}</span>
          <button type="button" disabled={!session||!policy||busy}
            className={policy?.enabled?primary:button} onClick={()=>void switchGlobal()}>
            Global {policy?.enabled?"ON":"OFF"}
          </button>
        </div>
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
      {isOwner&&ownerSection==="invites"&&<section className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-noema-border p-3">
        <div className="flex gap-2">
          <input className={field} maxLength={32} placeholder="Inviter alias" value={alias} onChange={e=>setAlias(e.target.value)} />
          <button type="button" className={primary+" shrink-0"} disabled={busy||!session}
            onClick={()=>void createInvite()}>New invite</button>
        </div>
        {inviteUrl&&<div className="flex flex-col gap-2">
          <ContactQrCode value={inviteUrl} label="Encrypted NOEMA contact invitation" />
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
                const url=new URL(inviteUrl);
                const token=url.hash
                  ? new URLSearchParams(url.hash.slice(1)).get("invite")
                  : url.pathname.split("/").at(-1);
                if(!token)throw Error("Invalid invitation URL.");
                await relayFetch("/v1/invites/revoke",{session,method:"POST",body:{token}});
                setInviteUrl("");setNote("Unredeemed invitation revoked.");
              })}>
              Revoke
            </button>
          </div>
        </div>}
      </section>}
      {(!isOwner||ownerSection==="inbox")&&<div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
        <aside aria-label="Contact list"
          className={(mobileContactsOpen?"flex flex-1":"hidden")+" min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-noema-border bg-[#111113] md:flex md:w-[225px] md:flex-none"}>
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-1 border-b border-noema-border px-3">
            <strong className="text-xs font-semibold">Contacts</strong>
            <div className="flex items-center gap-1">
              {isOwner&&<button type="button" title="Invite contact" aria-label="Invite contact"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white"
                onClick={()=>setOwnerSection("invites")}>
                <Icon icon="solar:user-plus-linear" className="text-lg" aria-hidden="true" />
              </button>}
              <button type="button" title="Refresh contacts" aria-label="Refresh contacts" disabled={!session}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                onClick={()=>{if(session)void receive(session);}}>
                <Icon icon="solar:refresh-linear" className="text-lg" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5" role="list">
            {threads.length===0&&<p className="px-2 py-4 text-xs text-neutral-500">No conversations yet.</p>}
            {threads.map(thread=>{
              const name=thread.owner===session?.deviceId?thread.guestAlias:thread.ownerAlias;
              const activeContact=thread.id===selected;
              const newContact=newThreadIds.includes(thread.id);
              return <div role="listitem" key={thread.id}>
                <button type="button" aria-current={activeContact?"true":undefined}
                  aria-label={"Open conversation with "+name}
                  onClick={()=>{
                    const nextId=thread.id;
                    messageLoadSequence.current++;
                    setSelected(nextId);selectedRef.current=nextId;
                    setNewThreadIds(current=>current.filter(id=>id!==nextId));
                    setMessages([]);setError("");
                    mobileContactsRef.current=false;
                    setMobileContactsOpen(false);
                    if(session)void loadMessages(session,thread).catch(e=>{
                      if(alive.current&&selectedRef.current===nextId)setError(errText(e));
                    });
                  }}
                  className={"flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition-colors "+
                    (activeContact?"bg-[#222825] text-noema-lime":"text-neutral-300 hover:bg-white/[0.05]")}>
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-noema-border bg-[#1b211e] text-sm font-semibold">
                    {(name.trim().slice(0,1)||"·").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {newContact?"New contact":thread.updatedAt?new Date(thread.updatedAt).toLocaleDateString():"Conversation"}
                    </span>
                  </span>
                  {newContact&&<span aria-label="New contact" className="h-2 w-2 shrink-0 rounded-full bg-noema-lime" />}
                </button>
              </div>;
            })}
          </div>
        </aside>
        <div className={(mobileContactsOpen?"hidden":"flex")+" min-h-0 min-w-0 flex-1 flex-col md:flex"}>
        {active?<section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-noema-border bg-[#111113]">
          <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-noema-border px-3 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" aria-label="Back to contacts"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-300 hover:bg-white/5 md:hidden"
                onClick={()=>{mobileContactsRef.current=true;setMobileContactsOpen(true);}}>
                <Icon icon="solar:arrow-left-linear" className="text-lg" aria-hidden="true" />
              </button>
              <p className="truncate text-xs font-medium">{ownerThread?active.guestAlias:active.ownerAlias}</p>
            </div>
            {ownerThread?<details className="relative shrink-0">
              <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-base text-neutral-400" aria-label="Conversation settings">⋯</summary>
              <div className="absolute right-0 z-20 mt-1 rounded-lg border border-noema-border bg-[#191c1a] p-2 shadow-lg">
                <button type="button" disabled={busy||!session} onClick={()=>void switchThread()}
                  className={button+" whitespace-nowrap"}>
                  AI Reception: {active.receptionEnabled?"On":"Off"}
                </button>
              </div>
            </details>:active.receptionEnabled&&<span className="text-[10px] text-noema-violet">AI Reception enabled</span>}
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
            <textarea className={field+" flex-1 resize-none"} rows={1} maxLength={3000} value={draft}
              placeholder="Message…" aria-label="Message"
              onChange={e=>setDrafts(current=>({...current,[selected]:e.target.value}))} />
            <button type="button" className={primary} disabled={!draft.trim()||busy||!session}
              onClick={()=>void send()}>Send</button>
          </div>
        </section>:<div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-noema-border bg-[#111113] p-4 text-center text-xs text-neutral-500">
          Select a contact to start chatting.
        </div>}
        </div>
      </div>}
    </>}
  </main>;
}
