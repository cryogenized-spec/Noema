"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { AGENT_ROLE_DEFINITIONS, normalizeAgentRoles } from "@/lib/agents/role-routing";
import { useAgentStore } from "@/store/agent-store";
import { relayAvailable } from "@/lib/network/relay-client";

/**
 * The owner-bound contact relay runs on a single stable origin. A temporary
 * preview MUST NOT mint a different owner identity or display local-only QR
 * messaging as if it delivered messages.
 */
const stableContactUrl = "https://noema-contact-staging.vercel.app/connect";

export default function ContactBridgePage() {
  const { agents, hydrated, hydrating, hydrateAgents } = useAgentStore();
  useEffect(() => {
    if (!hydrated && !hydrating) void hydrateAgents();
  }, [hydrated, hydrating, hydrateAgents]);

  const receptionist = agents.find((agent) =>
    normalizeAgentRoles(agent.roleAssignments).includes("primary"));
  const assignedRoles = AGENT_ROLE_DEFINITIONS.map((role) => ({
    ...role,
    agent: agents.find((item) => normalizeAgentRoles(item.roleAssignments).includes(role.id)),
  }));

  return (
    <main className="min-h-dvh bg-noema-midnight px-3 pb-9 pt-4 text-white sm:px-6">
      <div className="mx-auto max-w-[680px] space-y-4">
        <header className="flex items-center justify-between gap-3 border-b border-noema-border pb-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-neutral-300 hover:text-noema-lime">
            <Icon icon="solar:arrow-left-linear" aria-hidden="true" /> Workspace
          </Link>
          <strong className="text-sm tracking-wider">Contact bridge</strong>
          <span className="rounded-md border border-noema-lime/40 px-2 py-1 text-[10px] text-noema-lime">
            CONTACT HUB
          </span>
        </header>

        <section className="space-y-3 rounded-xl border border-noema-lime/30 bg-[#101712] p-4">
          <h1 className="text-lg font-semibold">Your encrypted NOEMA contacts</h1>
          <p className="text-xs leading-5 text-neutral-300">
            Real conversations and invitation QR codes live in the owner-bound Contact inbox.
            Create an invitation there, then scan it with another authorised device.
            Messages appear under Guest contacts in that inbox—not in local AI Chat.
          </p>
          {!relayAvailable && <p className="rounded-lg border border-noema-gold/30 bg-[#221d11] p-3 text-xs leading-5 text-noema-gold">
            This development preview has no Cloudflare relay. Its browser identity is
            separate from the registered staging owner. The button below opens
            the connected, stable Contact site without changing your owner device.
          </p>}
          <a href={relayAvailable ? "/connect" : stableContactUrl}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-noema-lime px-3 text-sm font-semibold text-black">
            <Icon icon="solar:chat-round-dots-bold" aria-hidden="true" />
            {relayAvailable ? "Open encrypted inbox / New invite" : "Open connected Contact inbox"}
          </a>
          <p className="text-[11px] leading-5 text-neutral-500">
            No demo QR is shown here: older demonstration chats never sent messages to
            Cloudflare. Use only a fresh invitation from the connected Contact inbox.
            This private staging service still requires Vercel access for both browsers.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-noema-border bg-[#111113] p-4">
          <div>
            <h2 className="text-sm font-semibold text-noema-lime">Your proposed reception agent</h2>
            <p className="mt-1 text-xs text-neutral-500">
              This reads local role assignments only. It does not wake or authorise agents.
            </p>
          </div>
          {receptionist ? (
            <div className="flex items-center gap-3 rounded-lg border border-noema-border bg-black/50 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-noema-border bg-[#202124]">
                {receptionist.avatarImage ? <Image src={receptionist.avatarImage} width={80} height={80}
                  className="h-full w-full object-cover" unoptimized alt="Agent avatar" /> :
                  <Icon icon="solar:cpu-bolt-bold" className="text-xl text-noema-lime" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{receptionist.name}</p>
                <p className="text-xs text-neutral-400">Reception / Chat · local assignment</p>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-noema-border p-3 text-xs text-neutral-400">
              No reception agent assigned. Choose a red Chat responsibility in AI Studio → Roles.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {assignedRoles.map((entry) => (
              <div key={entry.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-noema-border bg-black/30 p-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="min-w-0 truncate text-xs text-neutral-300">{entry.shortLabel}</span>
                <span className="ml-auto max-w-[45%] truncate text-[10px] text-neutral-500">
                  {entry.agent?.name ?? "Unassigned"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-neutral-400">
            AI Reception remains a separate opt-in. It must be enabled globally and for a
            specific conversation before an agent can attempt a reply.
          </p>
        </section>
      </div>
    </main>
  );
}
