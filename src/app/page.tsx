"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation";
import type { TabKey } from "@/components/layout/bottom-tabs";
import { ChatScreen } from "@/components/chat/chat-screen";
import { ApiLockboxScreen } from "@/components/settings/api-lockbox-screen";
import { AgentStudioScreen } from "@/components/agents/agent-studio-screen";
import { OrganizerScreen } from "@/components/organizer/organizer-screen";
import { SignalsScreen } from "@/components/signals/signals-screen";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopRailOpen, setDesktopRailOpen] = useState(true);

  const toggleNavigation = () => {
    // The menu control is available at every breakpoint. The desktop rail
    // collapses; on phones the same control opens the RADIX-style flyout.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setDesktopRailOpen((open) => !open);
    } else {
      setMobileMenuOpen((open) => !open);
    }
  };

  return (
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden bg-noema-midnight text-white">
      <TopBar onMenuToggle={toggleNavigation} mobileMenuOpen={mobileMenuOpen} desktopRailOpen={desktopRailOpen} />
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <WorkspaceNavigation activeTab={activeTab} onTabChange={setActiveTab}
          mobileOpen={mobileMenuOpen} desktopOpen={desktopRailOpen}
          onClose={() => setMobileMenuOpen(false)} />
        <div className="mx-auto flex h-full min-h-0 min-w-0 w-full max-w-[660px] flex-1 flex-col border-x border-noema-border bg-[#09090b]">
          {/* RADIX-style single-workspace pane: no redundant WORKSPACE / CHAT banner.
              Each module owns its internal tabs and scroll region. */}
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-2 sm:p-3">
            {activeTab === "chat" ? <ChatScreen /> :
              activeTab === "agents" ? <AgentStudioScreen /> :
              activeTab === "signals" ? <SignalsScreen /> :
              activeTab === "organizer" ? <OrganizerScreen /> :
              <ApiLockboxScreen />}
          </div>
        </div>
      </div>
    </main>
  );
}
