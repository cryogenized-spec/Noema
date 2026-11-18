"use client";

import {useEffect,useState} from "react";
import {Icon} from "@iconify/react";
import {ContactQrCode} from "@/components/contact/contact-qr-code";
import {ensureRelaySession, type RelaySession} from "@/lib/network/relay-client";
import {
  accountEnrollmentAvailable, myAccounts, registerAccount,
  createPairOffer, requestDevicePairing, pendingDevicePairings,
  pairingRequestStatus, approveDevicePairing, accountDevices,
  revokeLinkedDevice, type RegisteredAccount,type PairRequest,type LinkedDevice,
  type AccountRole,
} from "@/lib/network/account-client";
import {makePairingLink,parsePairingFragment,type PairingLink} from "@/lib/identity/pairing-link";
import type {LocalIdentityDraft} from "@/types/identity";

const shell="rounded-xl border border-noema-border bg-[#111113] p-3.5 sm:p-5";
const field="min-h-10 w-full min-w-0 rounded-lg border border-noema-border bg-black/70 px-3 py-2 text-sm text-white";
const btn="min-h-10 rounded-lg border border-noema-border bg-black/40 px-3 py-2 text-xs font-semibold text-neutral-200 disabled:opacity-40";
const primary="min-h-10 rounded-lg bg-noema-lime px-3 py-2 text-xs font-semibold text-black disabled:opacity-40";
const heading="text-xs font-semibold uppercase tracking-[0.16em] text-noema-lime";
const errorText=(e:unknown)=>e instanceof Error?e.message:"Unable to complete the account action.";
type MemberAccount={account:RegisteredAccount;role:AccountRole};
interface Candidate {
  accountId:string;requestId:string;verificationCode:string;status:"pending"|"approved"|"expired"|"rejected";
}

export function AccountEnrollmentPanel({draft}:{draft:LocalIdentityDraft}) {
  const [session,setSession]=useState<RelaySession|null>(null);
  const [memberships,setMemberships]=useState<MemberAccount[]>([]);
  const [pending,setPending]=useState<PairRequest[]>([]);
  const [devices,setDevices]=useState<LinkedDevice[]>([]);
  const [pairLink,setPairLink]=useState("");
  const [invite,setInvite]=useState<PairingLink|null>(null);
  const [candidate,setCandidate]=useState<Candidate|null>(null);
  const [selectedAccount,setSelectedAccount]=useState("");
  const [approvalCodes,setApprovalCodes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!accountEnrollmentAvailable)return;
    let live=true;
    const fromHash=parsePairingFragment(window.location.hash);
    if(fromHash){
      setInvite(fromHash);
      // The token is deliberately kept in memory only; strip the capability
      // fragment from history as soon as it has been captured.
      window.history.replaceState(null,"",window.location.pathname+window.location.search);
    }
    void ensureRelaySession().then(s=>{if(live)setSession(s);})
      .catch(e=>{if(live)setError(errorText(e));});
    return()=>{live=false;};
  },[]);

  const action=async(run:()=>Promise<void>)=>{
    if(busy)return;
    setBusy(true);setError("");setMessage("");
    try{await run();}catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  const loadAccounts=async(s:RelaySession)=>{
    const result=await myAccounts(s);
    const joined=result.accounts.map(account=>({
      account,role:result.memberships.find(x=>x.accountId===account.id)?.role||"member",
    }));
    setMemberships(joined);
    setSelectedAccount(current=>joined.some(x=>x.account.id===current)?current:joined[0]?.account.id||"");
    return joined;
  };
  const refresh=()=>action(async()=>{
    if(!session)throw Error("Device login is not available.");
    const joined=await loadAccounts(session);
    const account=joined.find(x=>x.account.id===selectedAccount)||joined[0];
    if(account?.role==="owner"){
      const [inbox,members]=await Promise.all([
        pendingDevicePairings(session,account.account.id),accountDevices(session,account.account.id),
      ]);
      setPending(inbox.requests);setDevices(members.devices);
    }else{setPending([]);setDevices([]);}
    setMessage("Membership and device status refreshed.");
  });
  const create=()=>action(async()=>{
    if(!session||draft.intent!=="independent")throw Error("Choose Create my own account first.");
    if(!draft.handle||!draft.displayName)throw Error("Save a display name and preferred handle first.");
    if(!window.confirm("Register this signed device as an independent NOEMA account owner? This does not publish your private Workshop profile."))return;
    const res=await registerAccount(session,draft.displayName,draft.handle);
    await loadAccounts(session);
    setSelectedAccount(res.account.id);
    setMessage("Account registered with a distinct server account ID. Your Workshop data is still local.");
  });
  const offer=()=>action(async()=>{
    if(!session||!selectedAccount)throw Error("Select an owned account.");
    const res=await createPairOffer(session,selectedAccount);
    setPairLink(makePairingLink(window.location.origin,selectedAccount,res.token));
    setMessage("Single-use pairing link valid for five minutes. Compare the candidate's code and device ID before approving.");
  });
  const request=()=>action(async()=>{
    if(!session||!invite)throw Error("No pending pairing invitation.");
    const res=await requestDevicePairing(session,invite.accountId,invite.token);
    setCandidate({accountId:invite.accountId,requestId:res.requestId,
      verificationCode:res.verificationCode,status:"pending"});
    setInvite(null); // The consumed bearer capability should not remain in state.
    setMessage("Request submitted. Show the six-digit code to the account owner out of band.");
  });
  const check=()=>action(async()=>{
    if(!session||!candidate)return;
    const res=await pairingRequestStatus(session,candidate.accountId,candidate.requestId);
    setCandidate(current=>current?{...current,status:res.status}:null);
    if(res.status==="approved"){
      await loadAccounts(session);
      setMessage("Device approved. Account membership is active; encrypted history sharing still requires a separate secure transfer.");
    } else setMessage("Request status: "+res.status);
  });
  const approve=(requestId:string)=>action(async()=>{
    if(!session||!selectedAccount)throw Error("Owner sign-in required.");
    const code=approvalCodes[requestId]||"";
    const approved=pending.find(x=>x.id===requestId);
    if(!approved)throw Error("This request is no longer pending.");
    if(!window.confirm("Approve this specific device as a MEMBER, not an owner? Verify its device fingerprint and six-digit code out of band first."))return;
    const result=await approveDevicePairing(session,selectedAccount,requestId,code);
    setPending(items=>items.filter(x=>x.id!==requestId));
    setApprovalCodes(current=>({...current,[requestId]:""}));
    const updated=await accountDevices(session,selectedAccount);
    setDevices(updated.devices);
    setMessage("Approved member device: "+result.memberDeviceId.slice(0,10)+"…");
  });
  const revoke=(deviceId:string)=>action(async()=>{
    if(!session||!selectedAccount)return;
    if(!window.confirm("Revoke this member's future account access? Already delivered ciphertext cannot be recalled and encryption keys must be rotated separately."))return;
    await revokeLinkedDevice(session,selectedAccount,deviceId);
    const updated=await accountDevices(session,selectedAccount);
    setDevices(updated.devices);
    setMessage("Device membership revoked. Plan key rotation before relying on confidentiality from the former device.");
  });

  if(!accountEnrollmentAvailable) return null;
  const selected=memberships.find(x=>x.account.id===selectedAccount);
  const owner=selected?.role==="owner";
  return <div className="space-y-3">
    <section className={shell+" space-y-3"}>
      <p className={heading}>Account enrollment · controlled staging</p>
      <p className="text-xs leading-5 text-neutral-400">
        Registration uses the signed browser identity. It never uploads your private Workshop profile,
        shares model credentials, or automatically pairs another device.
      </p>
      {error&&<p role="alert" className="rounded-lg border border-rose-700/40 p-3 text-xs text-rose-200">{error}</p>}
      {message&&<p role="status" className="rounded-lg border border-noema-lime/30 p-3 text-xs text-noema-lime">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={()=>void refresh()} disabled={!session||busy}>
          <Icon icon="solar:refresh-linear" className="mr-1 inline" aria-hidden="true"/>
          Refresh accounts
        </button>
        {draft.intent==="independent"&&<button type="button" className={primary}
          onClick={()=>void create()} disabled={!session||busy||!draft.handle||!draft.displayName}>
          Register independent account
        </button>}
      </div>
      {memberships.length>0&&<label className="block text-xs text-neutral-300">
        Current account
        <select className={field+" mt-1"} value={selectedAccount}
          onChange={e=>{setSelectedAccount(e.target.value);setPending([]);setDevices([]);setPairLink("");}}>
          {memberships.map(({account,role})=><option key={account.id} value={account.id}>
            @{account.handle} · {role}
          </option>)}
        </select>
      </label>}
      {selected&&<p className="text-xs text-neutral-400">
        Authenticated as <strong className="text-neutral-200">{selected.role}</strong> of @{selected.account.handle}.
        The current messaging pilot and its old conversations are not automatically migrated.
      </p>}
    </section>
    {invite&&<section className={shell+" space-y-3"}>
      <p className={heading}>Invitation to join an account</p>
      <p className="break-all text-[11px] text-neutral-400">Account ID: {invite.accountId}</p>
      <p className="text-xs text-neutral-300">
        This will request membership for your current browser's public device key.
        The owner must separately verify and approve it. Opening the link alone grants no access.
      </p>
      <button type="button" className={primary} disabled={busy||!session}
        onClick={()=>void request()}>Request device pairing</button>
    </section>}
    {candidate&&<section className={shell+" space-y-3"}>
      <p className={heading}>Pairing request · {candidate.status}</p>
      <p className="text-xs text-neutral-400">
        Read this code to the existing owner using a trusted separate channel:
      </p>
      <p className="rounded-lg border border-noema-lime/30 bg-black/50 py-3 text-center font-mono text-3xl tracking-[0.25em] text-noema-lime">
        {candidate.verificationCode}
      </p>
      <button type="button" className={btn} disabled={busy||!session}
        onClick={()=>void check()}>Check approval status</button>
      {candidate.status==="approved"&&<p className="text-xs text-neutral-400">
        Pairing grants account membership only. Your existing device's message encryption keys
        are not silently copied from the owner's browser.
      </p>}
    </section>}
    {owner&&<section className={shell+" space-y-3"}>
      <p className={heading}>Pair another device</p>
      <p className="text-xs leading-5 text-neutral-400">
        Generate a one-use five-minute link, open it on the second device, and approve its signed
        request after comparing the fingerprint and six-digit code.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={()=>void offer()} disabled={!session||busy}>
          Generate pairing link
        </button>
        <button type="button" className={btn} onClick={()=>void refresh()} disabled={!session||busy}>
          Check requests
        </button>
      </div>
      {pairLink&&<div className="space-y-2 rounded-lg border border-noema-border p-3">
        <ContactQrCode value={pairLink} label="One-use device pairing invitation, includes private capability" />
        <p className="break-all text-[11px] text-neutral-400">{pairLink}</p>
        <button className={btn} type="button"
          onClick={()=>void navigator.clipboard.writeText(pairLink).then(()=>setMessage("Private pairing link copied."))}>
          Copy pairing link
        </button>
        <p className="text-[11px] leading-5 text-amber-200">
          Treat the full link as a sensitive, temporary capability. Do not post it publicly.
        </p>
      </div>}
      {pending.map(req=><div key={req.id} className="space-y-2 rounded-lg border border-noema-border p-3">
        <p className="text-xs font-semibold">Pending device</p>
        <p className="break-all font-mono text-[10px] text-neutral-400">{req.candidateDeviceId}</p>
        <p className="text-[11px] text-neutral-500">Requested {new Date(req.requestedAt).toLocaleString()}</p>
        <label className="block text-xs text-neutral-300">
          Verification code shown on candidate device
          <input className={field+" mt-1"} inputMode="numeric" maxLength={6}
            placeholder="Six digits" value={approvalCodes[req.id]||""}
            onChange={e=>setApprovalCodes(c=>({...c,[req.id]:e.target.value.replace(/[^0-9]/g,"")}))} />
        </label>
        <button type="button" className={primary} disabled={!session||busy||!/^\d{6}$/.test(approvalCodes[req.id]||"")}
          onClick={()=>void approve(req.id)}>Verify and approve member</button>
      </div>)}
      {devices.map(member=><div key={member.deviceId}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-noema-border p-3">
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-[10px] text-neutral-300">{member.deviceId}</p>
          <p className="mt-1 text-[11px] text-neutral-500">{member.role} · {member.status}</p>
        </div>
        {member.status==="active"&&member.role==="member"&&
          <button type="button" className={btn+" text-rose-300"} disabled={!session||busy}
            onClick={()=>void revoke(member.deviceId)}>Revoke</button>}
      </div>)}
    </section>}
  </div>;
}
