"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@iconify/react";
import { TopBar } from "@/components/layout/top-bar";
import { BottomTabs, type TabKey } from "@/components/layout/bottom-tabs";
import { ChatScreen } from "@/components/chat/chat-screen";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ApiLockboxScreen } from "@/components/settings/api-lockbox-screen";
import { AgentStudioScreen } from "@/components/agents/agent-studio-screen";
import { OrganizerScreen } from "@/components/organizer/organizer-screen";

const placeholders: Record<Exclude<TabKey, "chat" | "agents" | "organizer">, { title: string; description: string }> = {
  signals: {
    title: "Signals",
    description: "Your curated updates and watchpoints will appear here in a future slice.",
  },
  settings: {
    title: "Settings",
    description: "Privacy, sync and preference controls are queued for later iterations.",
  },
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("chat");

  return (
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 lg:gap-6 lg:pt-8">
      <TopBar/>
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[258px_minmax(0,1fr)]">
        <aside className="noema-mesh hidden min-h-0 flex-col justify-between rounded-xl border border-noema-border bg-[#0d0d0f] p-5 lg:flex">
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-noema-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-noema-lime"/>
              LOCAL WORKSPACE
            </div>
            <div>
              <h1 className="max-w-52 text-[32px] font-semibold leading-[1.15] tracking-tight text-white">A quieter way to <span className="text-noema-lime">connect.</span></h1>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-400">Conversations, knowledge and AI agents in one deliberate space.</p>
            </div>
            <div className="space-y-3 border-t border-noema-border pt-5">
              <div className="flex items-center gap-2 text-sm text-neutral-300"><Icon icon="solar:shield-check-linear" className="text-noema-lime"/> Local-first drafts</div>
              <div className="flex items-center gap-2 text-sm text-neutral-300"><Icon icon="solar:cpu-bolt-linear" className="text-noema-violet"/> Agent-ready workspace</div>
              <div className="flex items-center gap-2 text-sm text-neutral-300"><Icon icon="solar:link-round-linear" className="text-noema-gold"/> No phone-number identity</div>
            </div>
          </div>
          <div className="rounded-lg border border-noema-burgundy/60 bg-[#1a1016] p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-noema-gold">EARLY PREVIEW</p>
            <p className="text-sm font-medium text-white">An invitation should feel effortless.</p>
            <p className="mt-2 text-xs leading-5 text-neutral-400">Try a pseudonym, a suggested prompt and the proposed conversation journey. Network delivery is not yet enabled.</p>
            <Link href="/invite/demo" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-noema-lime px-3 py-2.5 text-xs font-semibold text-black hover:bg-[#d2ffa1]">
              Preview invitation <Icon icon="solar:arrow-right-up-linear" aria-hidden="true"/>
            </Link>
          </div>
        </aside>
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-noema-muted">WORKSPACE / {activeTab.toUpperCase()}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{activeTab === "chat" ? "Conversations" : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
            </div>
            <span className="rounded-md border border-noema-border px-2.5 py-1.5 text-[10px] text-neutral-400">LOCAL FIRST</span>
          </div>
          <div className="min-h-0 flex-1">
            {activeTab === "chat" ? <ChatScreen /> :
              activeTab === "agents" ? <AgentStudioScreen /> :
              activeTab === "organizer" ? <OrganizerScreen /> :
              activeTab === "settings" ? <ApiLockboxScreen /> : (
                <GlassPanel>
                  <section className="flex min-h-64 flex-col justify-center px-5 py-7 text-center">
                    <Icon icon="solar:radar-2-linear" className="mx-auto mb-4 text-3xl text-noema-violet"/>
                    <h2 className="text-lg font-semibold text-white">{placeholders[activeTab].title}</h2>
                    <p className="mt-2 text-sm text-noema-muted">{placeholders[activeTab].description}</p>
                  </section>
                </GlassPanel>
              )}
          </div>
          <BottomTabs activeTab={activeTab} onTabChange={setActiveTab}/>
        </section>
      </div>
    </main>
  );
}
