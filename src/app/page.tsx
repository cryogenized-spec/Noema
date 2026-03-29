"use client";

import { useState } from "react";
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
    description: "Profile, sync, and preference controls are queued for later iterations.",
  },
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("chat");

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-3 px-3 pb-3 pt-4">
      <TopBar />

      <div className="min-h-0 flex-1">
        {activeTab === "chat" ? (
          <ChatScreen />
        ) : activeTab === "agents" ? (
          <AgentStudioScreen />
        ) : activeTab === "organizer" ? (
          <OrganizerScreen />
        ) : activeTab === "settings" ? (
          <ApiLockboxScreen />
        ) : (
          <GlassPanel>
            <section className="flex h-full min-h-64 flex-col justify-center px-5 py-7 text-center">
              <h2 className="text-lg font-semibold text-white">{placeholders[activeTab].title}</h2>
              <p className="mt-2 text-sm text-slate-300">{placeholders[activeTab].description}</p>
            </section>
          </GlassPanel>
        )}
      </div>

      <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  );
}
