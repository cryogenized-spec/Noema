"use client";

import { Icon } from "@iconify/react";
import type { TabKey } from "@/components/layout/bottom-tabs";

const destinations: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "chat", label: "Chat", icon: "solar:chat-round-dots-bold" },
  { key: "signals", label: "Signals", icon: "solar:bolt-bold" },
  { key: "agents", label: "AI Studio", icon: "solar:cpu-bolt-bold" },
  { key: "organizer", label: "Organizer", icon: "solar:checklist-minimalistic-bold" },
  { key: "settings", label: "Settings", icon: "solar:settings-bold" },
];

interface WorkspaceNavigationProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  mobileOpen: boolean;
  desktopOpen: boolean;
  onClose: () => void;
}

export function WorkspaceNavigation({ activeTab, onTabChange, mobileOpen, desktopOpen, onClose }: WorkspaceNavigationProps) {
  const renderDestinations = (compact: boolean) => destinations.map((destination) => {
    const active = activeTab === destination.key;
    return (
      <button key={destination.key} type="button" title={destination.label}
        aria-label={compact ? destination.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={() => { onTabChange(destination.key); onClose(); }}
        className={`relative flex min-h-11 min-w-0 items-center rounded-xl transition-colors
          ${compact ? "w-12 justify-center px-2" : "w-full gap-3 px-3"}
          ${active ? "bg-white/[0.07] text-noema-lime" : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"}`}>
        {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-noema-lime" />}
        <Icon icon={destination.icon} className="shrink-0 text-xl" aria-hidden="true" />
        {!compact && <span className="text-sm font-medium">{destination.label}</span>}
      </button>
    );
  });

  return (
    <>
      {desktopOpen && (
        <aside className="hidden h-full w-[72px] shrink-0 border-r border-noema-border bg-[#101011] py-5 lg:flex"
          aria-label="Workspace navigation">
          <nav className="flex w-full flex-col items-center gap-2" aria-label="Workspace sections">
            {renderDestinations(true)}
          </nav>
        </aside>
      )}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/75" onClick={onClose} aria-label="Close navigation overlay" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,278px)] flex-col border-r border-noema-border bg-[#101011] p-4 shadow-2xl"
            aria-label="Mobile workspace navigation">
            <div className="mb-6 flex items-center justify-between border-b border-noema-border pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Navigate</p>
              <button type="button" onClick={onClose} aria-label="Close navigation"
                className="rounded-lg border border-noema-border p-2 text-neutral-300">
                <Icon icon="solar:close-circle-linear" className="text-lg" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex flex-col gap-2" aria-label="Workspace sections">
              {renderDestinations(false)}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
