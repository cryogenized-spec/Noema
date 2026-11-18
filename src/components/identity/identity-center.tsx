"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { db } from "@/lib/db/client";
import { ContactQrCode } from "@/components/contact/contact-qr-code";
import { AccountEnrollmentPanel } from "@/components/identity/account-enrollment-panel";
import { accountEnrollmentAvailable } from "@/lib/network/account-client";
import { getOrCreateDeviceIdentity, type DeviceIdentity } from "@/lib/security/device-identity";
import { ensureRelaySession, relayAvailable, relayGetIdentity } from "@/lib/network/relay-client";
import { normalizeIdentityDraft, validHandle } from "@/lib/identity/account-policy";
import type { LocalIdentityDraft } from "@/types/identity";

type Section = "account" | "devices" | "security";
type Verification = "unchecked" | "owner" | "guest" | "error";
const shell = "rounded-xl border border-noema-border bg-[#111113] p-3.5 sm:p-5";
const field = "mt-1.5 w-full min-w-0 rounded-lg border border-noema-border bg-black/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-noema-lime";
const outline = "min-h-10 rounded-lg border border-noema-border px-3 py-2 text-xs font-medium text-neutral-200 hover:border-noema-lime disabled:opacity-40";
const primary = "min-h-10 rounded-lg bg-noema-lime px-3 py-2 text-xs font-bold text-black hover:bg-[#d2ffa1] disabled:opacity-40";
const title = "text-xs font-semibold uppercase tracking-[0.14em] text-noema-lime";

export function IdentityCenter() {
  const [tab, setTab] = useState<Section>("account");
  const [draft, setDraft] = useState<LocalIdentityDraft>(() => normalizeIdentityDraft(null));
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [workshopAlias, setWorkshopAlias] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<Verification>("unchecked");
  const [showDeviceQr, setShowDeviceQr] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getOrCreateDeviceIdentity(),
      db.identityDrafts.get("self"),
      db.profiles.get("self"),
    ]).then(([device, saved, profile]) => {
      if (!active) return;
      if (device.status === "fulfilled") setIdentity(device.value);
      else setError("This browser could not load its cryptographic identity. Its data has not been overwritten.");
      if (saved.status === "fulfilled") setDraft(normalizeIdentityDraft(saved.value ?? null));
      else setError("Unable to load the local registration draft.");
      if (profile.status === "fulfilled") setWorkshopAlias(profile.value?.alias ?? "");
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  const edit = (patch: Partial<LocalIdentityDraft>) => {
    setDraft(previous => ({ ...previous, ...patch }));
    setDirty(true);
    setNotice("");
  };
  const save = async () => {
    setError(""); setNotice("");
    if (draft.handle.trim() && !validHandle(draft.handle.trim().toLowerCase().replace(/^@/, ""))) {
      setError("Choose a handle with 3–24 characters: start with a letter; use lowercase letters, numbers or underscores.");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const next = normalizeIdentityDraft({ ...draft, updatedAt: now });
      await db.identityDrafts.put(next);
      setDraft(next);
      setDirty(false);
      setNotice("Saved only in this browser. No online account was created or linked.");
    } catch {
      setError("Unable to save the local identity draft. Check browser storage permissions.");
    } finally {
      setSaving(false);
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Public device identifier copied.");
      setError("");
    } catch {
      setError("Clipboard access is unavailable. You can select and copy the identifier directly.");
    }
  };
  const verify = async () => {
    setVerification("unchecked"); setError(""); setNotice("");
    if (!relayAvailable) {
      setError("The staging relay is not configured on this build.");
      return;
    }
    setVerifying(true);
    try {
      // Explicit user action; do not silently register an account or pair a device.
      const signed = await ensureRelaySession();
      const status = await relayGetIdentity(signed);
      if (identity && status.deviceId !== identity.deviceId)
        throw Error("Staging returned a device ID different from this browser.");
      setVerification(status.owner ? "owner" : "guest");
      setNotice(status.owner
        ? "This device is the designated owner of the current private messaging pilot."
        : "The relay authenticated this device as a guest. No multi-device account pairing has occurred.");
    } catch (reason) {
      setVerification("error");
      setError(reason instanceof Error ? reason.message : "Unable to verify this device.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden bg-noema-midnight p-3 text-white sm:p-5">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[690px] flex-col gap-3">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-noema-border pb-3">
          <Link href="/" className="flex items-center gap-2 text-xs text-neutral-300 hover:text-noema-lime">
            <Icon icon="solar:arrow-left-linear" aria-hidden="true" />
            Workspace
          </Link>
          <h1 className="text-sm font-semibold">Identity & Devices</h1>
          <span className="rounded border border-noema-gold/40 px-2 py-1 text-[10px] text-noema-gold">
            STAGING
          </span>
        </header>
        <nav aria-label="Identity management sections"
          className="grid shrink-0 grid-cols-3 gap-1 rounded-lg border border-noema-border bg-[#111113] p-1">
          {([["account","Account"],["devices","Devices"],["security","Security"]] as const).map(([key,label]) => (
            <button key={key} type="button" aria-current={tab===key ? "page" : undefined}
              onClick={()=>{setTab(key);setError("");setNotice("");}}
              className={"min-h-11 rounded-md text-xs font-semibold " +
                (tab===key ? "bg-noema-lime text-black" : "text-neutral-400 hover:bg-white/[0.06] hover:text-white")}>
              {label}
            </button>
          ))}
        </nav>
        {error && <p role="alert" className="shrink-0 rounded-lg border border-rose-700/40 bg-rose-950/20 p-3 text-xs leading-5 text-rose-200">{error}</p>}
        {notice && <p role="status" className="shrink-0 rounded-lg border border-noema-lime/30 bg-noema-lime/5 p-3 text-xs leading-5 text-noema-lime">{notice}</p>}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-5">
          {!ready && <p className="p-5 text-sm text-neutral-400">Loading local identity…</p>}
          {ready && tab==="account" && <>
            <section className={shell+" space-y-3"}>
              <p className={title}>Your NOEMA identity</p>
              <h2 className="text-lg font-semibold">Start with your own profile</h2>
              <p className="text-xs leading-5 text-neutral-400">
                NOEMA already keeps your Workshop profile and signed device key locally.
                Choose how this device should join the future multi-user system.
                Saving these preferences does not claim a handle or open an account on Cloudflare.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  {key:"independent",name:"Create my own account",note:"Your own future profile, inbox and agents."},
                  {key:"join-existing",name:"Join an existing account",note:"Request approval from a device that already owns it."},
                ] as const).map(choice=>(
                  <button key={choice.key} type="button" aria-pressed={draft.intent===choice.key}
                    onClick={()=>edit({intent:choice.key})}
                    className={"rounded-lg border p-3 text-left transition "+
                      (draft.intent===choice.key?"border-noema-lime bg-[#1b2618]":"border-noema-border bg-black/40 hover:border-neutral-500")}>
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      <Icon icon={choice.key==="independent"?"solar:user-circle-linear":"solar:link-round-linear"} aria-hidden="true" />
                      {choice.name}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-neutral-400">{choice.note}</p>
                  </button>
                ))}
              </div>
              <label className="block text-xs text-neutral-300">
                Display name
                <input className={field} maxLength={50} value={draft.displayName}
                  onChange={e=>edit({displayName:e.target.value})}
                  placeholder="Name shown on your future account" autoComplete="nickname" />
              </label>
              <label className="block text-xs text-neutral-300">
                Preferred handle <span className="text-neutral-500">(not reserved)</span>
                <input className={field} maxLength={25} value={draft.handle}
                  onChange={e=>edit({handle:e.target.value.toLowerCase().replace(/^@/,"")})}
                  placeholder="example_maker" spellCheck={false} autoCapitalize="none" />
              </label>
              <p className="text-[11px] leading-5 text-neutral-500">
                Public handle availability, account ownership and membership will be checked by the
                future account service—not by this draft.
              </p>
              <button type="button" onClick={()=>void save()} disabled={saving}
                className={primary+" w-full"}>
                {saving ? "Saving locally…" : dirty ? "Save local registration draft" : "Save registration preferences"}
              </button>
            </section>
            <section className={shell+" space-y-2"}>
              <p className={title}>Workshop profile</p>
              <p className="text-sm font-semibold">{workshopAlias || "No public-facing alias saved on this device yet"}</p>
              <p className="text-xs leading-5 text-neutral-400">
                Your Workshop wall, skills, projects and gallery remain private to this browser.
                A separate, consent-based publishing and sync feature is still required.
              </p>
              <Link href="/profile" className={outline+" inline-flex items-center gap-2"}>
                Edit Workshop profile <Icon icon="solar:arrow-right-up-linear" aria-hidden="true"/>
              </Link>
            </section>
            {accountEnrollmentAvailable && <AccountEnrollmentPanel draft={draft} />}
            <section className={shell+" space-y-2"}>
              <p className={title}>Install NOEMA</p>
              <p className="text-xs leading-5 text-neutral-400">
                An app-store account is not required to use the website or install the PWA.
                On Android Chrome, open the browser menu and choose Install app or Add to Home screen.
                On desktop, use the browser&apos;s install control when available.
              </p>
              <p className="text-[11px] leading-5 text-neutral-500">
                Installation does not register a remote account or automatically import another
                device&apos;s Workshop profile or encryption keys. Stay on the same staging origin
                while testing; use device pairing once it has been implemented.
              </p>
            </section>
          </>}
          {ready && tab==="devices" && <>
            <section className={shell+" space-y-3"}>
              <p className={title}>This browser</p>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-noema-border bg-black/40">
                  <Icon icon="solar:devices-linear" className="text-2xl text-noema-lime" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{draft.deviceLabel.trim() || "Unnamed device"}</h2>
                  <p className="text-[11px] text-neutral-400">Locally generated P-256 signing identity</p>
                </div>
              </div>
              <label className="block text-xs text-neutral-300">
                Friendly device name (local)
                <input className={field} maxLength={40} value={draft.deviceLabel}
                  onChange={e=>edit({deviceLabel:e.target.value})} placeholder="e.g. My Laptop, Android Phone" />
              </label>
              <button type="button" onClick={()=>void save()} disabled={saving}
                className={primary+" w-full"}>Save local device label</button>
              <p className="text-[11px] text-neutral-400">Public device identifier</p>
              {identity ? (
                <>
                  <p className="break-all rounded-lg border border-noema-border bg-black/40 p-3 font-mono text-[11px] leading-5 text-neutral-200" aria-label="Current browser device identifier">
                    {identity.deviceId}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={outline} onClick={()=>void copy(identity.deviceId)}>
                      <Icon icon="solar:copy-linear" className="mr-1 inline" aria-hidden="true" /> Copy ID
                    </button>
                    <button type="button" className={outline} aria-pressed={showDeviceQr}
                      onClick={()=>setShowDeviceQr(previous=>!previous)}>
                      <Icon icon="solar:qr-code-linear" className="mr-1 inline" aria-hidden="true" />
                      {showDeviceQr?"Hide QR":"Show ID QR"}
                    </button>
                  </div>
                  {showDeviceQr && <div className="space-y-2 rounded-lg border border-noema-border p-3">
                    <ContactQrCode value={"noema-device:"+identity.deviceId} label="Public device ID only, not a device pairing or login QR" />
                    <p className="text-center text-[11px] leading-5 text-neutral-400">
                      This QR contains only the public device ID. Scanning it does not authorise,
                      pair or authenticate another device.
                    </p>
                  </div>}
                </>
              ) : <p className="text-xs text-rose-300">No usable local signing identity is available.</p>}
            </section>
            <section className={shell+" space-y-3"}>
              <p className={title}>Registration status</p>
              <p className="text-xs leading-5 text-neutral-400">
                Verify how this particular browser appears to the existing private relay.
                The check can create a signed guest session but will not pair devices,
                create a multi-user account or enable AI.
              </p>
              <button type="button" disabled={verifying||!identity||!relayAvailable}
                onClick={()=>void verify()} className={outline+" w-full"}>
                {verifying?"Verifying signed device…":"Check relay identity"}
              </button>
              {accountEnrollmentAvailable && <p className="text-[11px] leading-5 text-neutral-400">
                For approved account linking, open the Account tab and use the separate pairing section.
                Scanning the public device ID QR above is not an authorisation step.
              </p>}
              <p className="text-sm font-semibold">
                {verification==="unchecked"?"Not checked":verification==="owner"?"Staging messaging owner":
                  verification==="guest"?"Authenticated guest device":"Could not verify"}
              </p>
              {verification==="owner" && <p className="text-[11px] text-noema-lime">
                Owner of the current pilot relay, not automatically the owner of every NOEMA account.
              </p>}
              {verification==="guest" && <p className="text-[11px] text-neutral-400">
                This device may receive private invitations from the staging owner.
                It cannot manage the owner&apos;s inbox or sign in as their second account device.
              </p>}
            </section>
          </>}
          {ready && tab==="security" && <>
            <section className={shell+" space-y-3"}>
              <p className={title}>Account protection</p>
              <h2 className="text-sm font-semibold">One account, several authorised devices</h2>
              <p className="text-xs leading-5 text-neutral-400">
                Each device should keep its own private signing key. Future pairing requires a
                logged-in account owner to approve that specific device, with a signed,
                expiring challenge and an independently verified account membership.
              </p>
              <div className="space-y-2 text-xs leading-5 text-neutral-300">
                <p><Icon icon="solar:shield-check-linear" className="mr-2 inline text-noema-lime" aria-hidden="true" />
                  A phone must not become an owner merely by copying a device ID or QR.
                </p>
                <p><Icon icon="solar:lock-keyhole-linear" className="mr-2 inline text-noema-lime" aria-hidden="true" />
                  Pairing must not transmit the laptop&apos;s non-extractable private key.
                </p>
                <p><Icon icon="solar:close-circle-linear" className="mr-2 inline text-noema-lime" aria-hidden="true" />
                  Revoked devices must lose access to messages, agents and account settings.
                </p>
              </div>
            </section>
            <section className={shell+" space-y-2"}>
              <p className={title}>Release readiness</p>
              <p className="text-xs leading-5 text-neutral-300">
                This release provides the identity-management interface and local onboarding draft.
                Account creation, handle registration, device pairing, remote profile sync,
                revocation and encrypted multi-device key delivery are not active.
              </p>
              <Link href="/connect" className={outline+" inline-flex items-center gap-2"}>
                Open existing private Contact inbox
                <Icon icon="solar:arrow-right-up-linear" aria-hidden="true" />
              </Link>
              <p className="text-[11px] leading-5 text-neutral-500">
                Clearing this site&apos;s browser data may destroy your signing key, contact encryption
                keys, local profile and drafts. No secure multi-device recovery is available yet.
              </p>
            </section>
          </>}
        </div>
      </div>
    </main>
  );
}
