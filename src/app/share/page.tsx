"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { ContactQrCode } from "@/components/contact/contact-qr-code";
import { AGENT_ROLE_DEFINITIONS, normalizeAgentRoles } from "@/lib/agents/role-routing";
import { useAgentStore } from "@/store/agent-store";
import { relayAvailable } from "@/lib/network/relay-client";

const defaultMessage = "Here's NOEMA's anonymous chat demonstration. Live invitations and AI replies are still being built.";

export default function ContactBridgePage() {
  const { agents, hydrated, hydrating, hydrateAgents } = useAgentStore();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  const [status, setStatus] = useState("");
  useEffect(() => { setUrl(window.location.origin + "/invite/demo"); }, []);
  useEffect(() => {
    if (!hydrated && !hydrating) void hydrateAgents();
  }, [hydrated, hydrating, hydrateAgents]);

  const receptionist = agents.find((agent) => normalizeAgentRoles(agent.roleAssignments).includes("primary"));
  const assignedRoles = AGENT_ROLE_DEFINITIONS.map((role) => ({
    ...role,
    agent: agents.find((item) => normalizeAgentRoles(item.roleAssignments).includes(role.id)),
  }));
  const shareText = [message.trim(), url].filter(Boolean).join("\n\n");
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(label + " copied.");
    } catch { setStatus("Clipboard unavailable. Select and copy the text manually."); }
  };
  const share = async () => {
    if (!url) return;
    if (!navigator.share) {
      setStatus("Native share is unavailable; use Copy or WhatsApp instead.");
      return;
    }
    try {
      await navigator.share({ title: "NOEMA demo", text: message, url });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("Sharing was unavailable in this browser.");
    }
  };

  return (
    <main className="min-h-dvh bg-noema-midnight px-3 pb-9 pt-4 text-white sm:px-6">
      <div className="mx-auto max-w-[680px] space-y-4">
        <header className="flex items-center justify-between gap-3 border-b border-noema-border pb-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-neutral-300 hover:text-noema-lime">
            <Icon icon="solar:arrow-left-linear" aria-hidden="true" /> Workspace
          </Link>
          <strong className="text-sm tracking-wider">Contact bridge</strong>
          <span className="rounded-md border border-noema-gold/40 px-2 py-1 text-[10px] text-noema-gold">{relayAvailable ? "CONTACT HUB" : "DEMO ONLY"}</span>
        </header>

        <section className="rounded-xl border border-noema-gold/30 bg-[#1c1711] p-4">
          <h1 className="text-lg font-semibold">{relayAvailable ? "Your encrypted NOEMA contacts" : "Chat demonstration"}</h1>
          <p className="mt-2 text-xs leading-5 text-neutral-300">
            {relayAvailable
              ? "Real contact invitations and new conversations live in the encrypted Contact inbox. Select New invite there to get a working QR; the older demonstration QR is intentionally hidden so it cannot be mistaken for message delivery."
              : "This local demonstration cannot deliver messages. An encrypted contact relay must be configured before real invitations are available."}
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-noema-lime/30 bg-[#101712] p-4">
          <h2 className="text-sm font-semibold text-noema-lime">Encrypted contact bridge · new</h2>
          <p className="text-xs leading-5 text-neutral-300">
            The real contact interface now supports signed device identity, one-use invitations,
            encrypted guest messages, and separately approved Reception agent replies with daily limits.
            Use the Contact inbox for live invitations and conversations. The owner must be signed in on the approved staging browser, and the relay must be configured.
          </p>
          <Link href="/connect" className="flex min-h-11 items-center justify-center rounded-lg bg-noema-lime px-3 text-sm font-semibold text-black">
            {relayAvailable ? "Open inbox / create real QR" : "Open encrypted contact setup"}
          </Link>
          {relayAvailable && <p className="text-[11px] text-noema-lime">
            Only an invitation made with New invite opens an actual encrypted conversation.
            Messages are received in the Contact inbox—not in the local AI Chat tab.
          </p>}
          {!relayAvailable && <p className="text-[11px] text-noema-gold">
            Cloudflare relay is not configured. The demonstration below is local-only.
          </p>}
        </section>

        {!relayAvailable && <section className="space-y-4 rounded-xl border border-noema-border bg-[#111113] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-noema-lime">Local demonstration QR</h2>
            <span className="text-[11px] text-neutral-500">HTTPS · no external QR service</span>
          </div>
          {url && <ContactQrCode value={url} />}
          <p className="text-center text-[11px] text-neutral-400">Scan to open this NOEMA demo in a browser.</p>
          <label className="block text-xs text-neutral-300">Demo destination URL
            <input readOnly value={url} aria-label="Demo URL"
              className="mt-1 w-full min-w-0 rounded-lg border border-noema-border bg-black px-3 py-2 font-mono text-xs text-neutral-300" />
          </label>
          <label className="block text-xs text-neutral-300">WhatsApp message (editable)
            <textarea value={message} maxLength={500} rows={3} onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-noema-border bg-black px-3 py-2 text-sm text-white" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" disabled={!url} onClick={() => void copy(url, "Demo link")}
              className="min-h-11 rounded-lg border border-noema-border px-2 text-xs text-neutral-200 hover:border-noema-lime">
              <Icon icon="solar:copy-linear" className="mr-1 inline" aria-hidden="true" /> Copy link
            </button>
            <button type="button" disabled={!url} onClick={() => void copy(shareText, "WhatsApp text")}
              className="min-h-11 rounded-lg border border-noema-border px-2 text-xs text-neutral-200 hover:border-noema-lime">
              <Icon icon="solar:clipboard-list-linear" className="mr-1 inline" aria-hidden="true" /> Copy text
            </button>
            <button type="button" disabled={!url} onClick={() => void share()}
              className="min-h-11 rounded-lg border border-noema-border px-2 text-xs text-neutral-200 hover:border-noema-lime">
              <Icon icon="solar:share-linear" className="mr-1 inline" aria-hidden="true" /> Share…
            </button>
            <a href={url ? "https://wa.me/?text=" + encodeURIComponent(shareText) : undefined}
              target="_blank" rel="noopener noreferrer" aria-disabled={!url}
              className="flex min-h-11 items-center justify-center rounded-lg bg-noema-lime px-2 text-xs font-semibold text-black">
              WhatsApp
            </a>
          </div>
          {status && <p role="status" className="text-xs text-noema-lime">{status}</p>}
          <p className="text-[11px] leading-5 text-neutral-500">
            Short contact codes and revocable invitation QR links need the authenticated Cloudflare routing service.
            We will not create misleading permanent codes or embed raw private keys in QR codes.
          </p>
        </section>}

        <section className="space-y-3 rounded-xl border border-noema-border bg-[#111113] p-4">
          <div>
            <h2 className="text-sm font-semibold text-noema-lime">Your proposed reception agent</h2>
            <p className="mt-1 text-xs text-neutral-500">This reads local role assignments only. It does not wake or authorise agents.</p>
          </div>
          {receptionist ? (
            <div className="flex items-center gap-3 rounded-lg border border-noema-border bg-black/50 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-noema-border bg-[#202124]">
                {receptionist.avatarImage ? <Image src={receptionist.avatarImage} width={80} height={80}
                  className="h-full w-full object-cover" unoptimized alt="Agent avatar" />
                  : <Icon icon="solar:cpu-bolt-bold" className="text-xl text-noema-lime" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{receptionist.name}</p>
                <p className="text-xs text-neutral-400">Reception / Chat · local assignment</p>
              </div>
            </div>
          ) : <p className="rounded-lg border border-dashed border-noema-border p-3 text-xs text-neutral-400">
            No reception agent assigned. Choose a red Chat responsibility in AI Studio → Roles.
          </p>}
          <div className="grid grid-cols-2 gap-2">
            {assignedRoles.map((entry) => <div key={entry.id}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-noema-border bg-black/30 p-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="min-w-0 truncate text-xs text-neutral-300">{entry.shortLabel}</span>
              <span className="ml-auto max-w-[45%] truncate text-[10px] text-neutral-500">{entry.agent?.name ?? "Unassigned"}</span>
            </div>)}
          </div>
          <p className="text-xs leading-5 text-neutral-400">
            The encrypted Contact inbox handles actual guest messages and owner-only invitations.
            AI Reception stays off until you separately enable it globally and for each conversation.
            The older preview remains isolated and cannot deliver messages.
          </p>
        </section>
      </div>
    </main>
  );
}
