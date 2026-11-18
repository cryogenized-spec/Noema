"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { relayAvailable } from "@/lib/network/relay-client";

const names = [
  "Moss Lantern",
  "Violet Atlas",
  "Amber Finch",
  "Silver Circuit",
  "Burgundy Fox",
  "Quiet Comet",
  "Lime Sparrow",
  "Golden Fern",
  "Midnight Wren",
  "Obsidian Bloom",
  "Cloud Wanderer",
  "Nova Orchard",
];

const prompts = [
  "Hi! Could you help me find the right option?",
  "I'd like a quick quote, please.",
  "I have a question about an order.",
  "Could I speak to someone directly?",
];

type Stage = "identity" | "conversation";

function nextPersona(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return names[bytes[0] % names.length];
}

function cleanAlias(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 32);
}

export default function InviteDemoPage() {
  // Do not let a legacy demonstration QR impersonate the real messaging
  // flow once the encrypted relay is enabled on this PWA origin.
  const [stage, setStage] = useState<Stage>("identity");
  const [alias, setAlias] = useState("");
  const [guestName, setGuestName] = useState("");
  const [draft, setDraft] = useState(prompts[0]);
  const [localMessages, setLocalMessages] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);

  if (relayAvailable) return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-5 text-white">
      <span className="w-fit rounded border border-noema-gold/40 px-3 py-1 text-xs text-noema-gold">
        DEMONSTRATION ONLY
      </span>
      <h1 className="text-xl font-semibold">This QR cannot deliver messages</h1>
      <p className="text-sm leading-6 text-neutral-300">
        You opened an older NOEMA invitation demonstration. It does not create a contact
        or send anything to the owner. For genuine encrypted messaging, ask the owner
        for a fresh private QR generated using <strong>New invite</strong> in the Contact inbox.
      </p>
      <Link href="/connect" className="rounded-lg bg-noema-lime px-4 py-3 text-center text-sm font-semibold text-black">
        Go to encrypted Contact
      </Link>
      <p className="text-xs text-neutral-500">
        The real invitation URL contains /invite/ followed by a unique token and a private key fragment.
        Do not publish that complete link.
      </p>
    </main>
  );

  function continueAsGuest() {
    setGuestName(cleanAlias(alias) || nextPersona());
    setStage("conversation");
    setStatus("");
  }

  function sendPreview() {
    const message = draft.trim();
    if (!message) return;
    setLocalMessages((current) => [...current, message]);
    setDraft("");
    setStatus("Saved to this preview only. No recipient was contacted and no agent was activated.");
  }

  async function copyDemoLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/invite/demo");
      setCopied(true);
      setStatus("Copied the demo link. It does not redeem an actual invitation.");
    } catch {
      setStatus("Clipboard permission was unavailable; copy this page URL from your browser.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 pb-10 pt-6 sm:px-8 lg:pt-10">
      <header className="flex items-center justify-between gap-4 border-b border-noema-borderSoft pb-5">
        <Link href="/" className="flex items-center gap-3" aria-label="Back to NOEMA">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-noema-border bg-[#141416] text-xl font-semibold text-noema-lime">N</span>
          <span className="text-sm font-semibold tracking-[0.16em] text-white">NOEMA<span className="text-noema-lime">.</span></span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white">
          <Icon icon="solar:arrow-left-linear" aria-hidden="true" />
          Workspace
        </Link>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          <span className="h-1.5 w-1.5 rounded-full bg-noema-lime"/>
          INVITATION FLOW / INTERACTIVE PREVIEW
        </div>
        <button type="button" onClick={() => void copyDemoLink()} className="inline-flex items-center gap-2 rounded-md border border-noema-border bg-[#151517] px-3 py-2 text-xs text-white hover:border-noema-lime/40">
          <Icon icon="solar:copy-linear" aria-hidden="true" />
          {copied ? "Demo link copied" : "Copy demo link"}
        </button>
      </div>

      <div className="rounded-lg border border-noema-gold/30 bg-[#211a10] px-4 py-3 text-xs leading-relaxed text-neutral-200" role="note">
        <span className="font-semibold text-noema-gold">Local prototype.</span> This page demonstrates an anonymous invitation journey. It does not issue or redeem invitations, connect devices, ping a contact, deliver WhatsApp messages, or wake an AI agent.
      </div>

      {stage === "identity" ? (
        <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_340px]">
          <section className="noema-mesh rounded-xl border border-noema-border bg-[#0c0c0e] p-6 sm:p-10">
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-noema-violet">01 / MEET</p>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
              A conversation, <span className="text-noema-lime">without the paperwork.</span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-neutral-400 sm:text-base">
              Arrive by a link. Choose a display name—or let NOEMA pick something unexpected. No phone number, account email or personal profile required for this preview.
            </p>
            <div className="mt-9 max-w-md">
              <label htmlFor="guest-alias" className="mb-2 block text-xs font-medium text-neutral-200">How should you appear?</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="guest-alias"
                  type="text"
                  autoComplete="nickname"
                  maxLength={32}
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  placeholder="Your display name (optional)"
                  className="min-h-11 w-full min-w-0 rounded-lg border border-noema-border bg-black px-4 text-sm text-white placeholder:text-neutral-500 focus:border-noema-lime focus:outline-none"
                />
                <button type="button" onClick={() => setAlias(nextPersona())} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-noema-border bg-[#19151d] px-4 text-xs font-semibold text-noema-violet hover:border-noema-violet">
                  <Icon icon="solar:shuffle-bold" aria-hidden="true"/> Random persona
                </button>
              </div>
              <p className="mt-2 text-xs text-neutral-500">Your display name is not a verified identity.</p>
              <button type="button" onClick={continueAsGuest} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-noema-lime px-5 text-sm font-bold text-black transition hover:bg-[#d4ffa6]">
                Continue anonymously <Icon icon="solar:arrow-right-linear" className="text-lg" aria-hidden="true"/>
              </button>
            </div>
          </section>

          <aside className="flex flex-col justify-between rounded-xl border border-noema-border bg-[#121214] p-6">
            <div>
              <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">THE INTENDED EXPERIENCE</p>
              <div className="space-y-6">
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noema-lime/10 text-noema-lime">1</span>
                  <div><h2 className="text-sm font-semibold text-white">Open the link</h2><p className="mt-1 text-xs leading-5 text-neutral-400">Delivered in WhatsApp, a browser or another channel.</p></div>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noema-violet/10 text-noema-violet">2</span>
                  <div><h2 className="text-sm font-semibold text-white">Appear anonymously</h2><p className="mt-1 text-xs leading-5 text-neutral-400">A random alias is enough for a first conversation.</p></div>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noema-burgundy/30 text-noema-gold">3</span>
                  <div><h2 className="text-sm font-semibold text-white">Choose what to ask</h2><p className="mt-1 text-xs leading-5 text-neutral-400">Editable prompt suggestions; sending requires one explicit tap.</p></div>
                </div>
              </div>
            </div>
            <p className="mt-8 border-t border-noema-border pt-4 text-xs leading-5 text-neutral-500">Real identity proofs, invite redemption and recipient notifications will be implemented after the authenticated messaging backend.</p>
          </aside>
        </div>
      ) : (
        <div className="grid min-h-[550px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="flex flex-col justify-between rounded-xl border border-noema-border bg-[#101012] p-6">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.19em] text-noema-gold">02 / CONVERSATION</span>
              <div className="mt-7 flex h-12 w-12 items-center justify-center rounded-xl border border-noema-violet/40 bg-noema-violet/10 text-xl font-bold text-noema-violet">A</div>
              <h1 className="mt-4 text-xl font-semibold text-white">Ayarime <span className="text-sm font-normal text-neutral-500">(demo)</span></h1>
              <p className="mt-2 text-sm leading-6 text-neutral-400">This is how a recipient and their optional agent would appear after a valid invitation is redeemed.</p>
              <div className="mt-6 flex items-center gap-2 rounded-md border border-noema-border bg-black p-3 text-xs text-neutral-300">
                <Icon icon="solar:user-linear" className="text-noema-lime" aria-hidden="true"/>
                Visiting as <strong className="truncate font-medium text-white">{guestName}</strong>
              </div>
            </div>
            <button type="button" onClick={() => { setStage("identity"); setLocalMessages([]); setStatus(""); }} className="mt-8 inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-white">
              <Icon icon="solar:arrow-left-linear" aria-hidden="true"/> Change guest identity
            </button>
          </aside>

          <section className="flex min-h-[550px] flex-col overflow-hidden rounded-xl border border-noema-border bg-[#0c0c0e]">
            <div className="flex items-center justify-between gap-4 border-b border-noema-border px-5 py-4">
              <div><p className="text-sm font-semibold text-white">Ayarime · Preview contact</p><p className="mt-1 text-[11px] text-neutral-500">Not connected · No automatic ping</p></div>
              <span className="rounded-md border border-noema-violet/40 bg-noema-violet/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-noema-violet">AI OPTIONAL</span>
            </div>
            <div className="noema-mesh flex-1 space-y-4 p-5">
              <div className="max-w-md rounded-lg border border-noema-border bg-[#171719] p-4 text-sm text-neutral-200">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-noema-gold">CONVERSATION PREVIEW</p>
                Select a ready-made question or write your own. No one receives anything in this prototype.
              </div>
              {localMessages.map((message, index) => (
                <div key={index} className="ml-auto max-w-[85%] rounded-xl border border-noema-lime/25 bg-[#1a2414] px-4 py-3 text-sm text-white">
                  {message}
                  <p className="mt-2 text-right text-[10px] text-noema-lime">Local preview only</p>
                </div>
              ))}
            </div>
            <div className="border-t border-noema-border bg-[#111113] p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">SUGGESTED FIRST MESSAGE</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {prompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setDraft(prompt)} className="rounded-md border border-noema-border bg-black px-3 py-2 text-left text-xs text-neutral-300 hover:border-noema-violet hover:text-white">
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} aria-label="Message draft" className="max-h-36 min-h-16 min-w-0 flex-1 resize-y rounded-lg border border-noema-border bg-black p-3 text-sm text-white placeholder:text-neutral-500 focus:border-noema-lime focus:outline-none" placeholder="Write your first message..." />
                <button type="button" disabled={!draft.trim()} onClick={sendPreview} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-lg bg-noema-lime px-4 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">
                  Preview send <Icon icon="solar:plain-bold" aria-hidden="true"/>
                </button>
              </div>
              {status && <p className="mt-3 text-xs text-noema-gold" role="status">{status}</p>}
              <p className="mt-3 text-[11px] leading-5 text-neutral-500">Production: explicit Send → authenticated delivery → recipient notification → opt-in agent response. None of those network actions are active here.</p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
