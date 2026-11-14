"use client";

import { Icon } from "@iconify/react";

const tabs = [
  { key: "chat", label: "Chat", icon: "solar:chat-round-dots-bold" },
  { key: "signals", label: "Signals", icon: "solar:bolt-bold" },
  { key: "agents", label: "Agents", icon: "solar:cpu-bolt-bold" },
  { key: "organizer", label: "Organizer", icon: "solar:checklist-minimalistic-bold" },
  { key: "settings", label: "Settings", icon: "solar:settings-bold" },
] as const;

export type TabKey = (typeof tabs)[number]["key"];

interface BottomTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export function BottomTabs({ activeTab, onTabChange }: BottomTabsProps) {
  return (
    <nav aria-label="Main navigation" className="rounded-xl border border-noema-border bg-[#101011] p-1.5 shadow-glass">
      <ul className="grid grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <li key={tab.key}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                className={"relative flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-[11px] font-medium transition " +
                  (active ? "bg-[#222326] text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white")}
                onClick={() => onTabChange(tab.key)}
              >
                {active && <span className="absolute left-3 right-3 top-0 h-[2px] rounded-b-full bg-noema-lime" />}
                <Icon icon={tab.icon} className={"text-lg " + (active ? "text-noema-lime" : "text-neutral-500")} aria-hidden="true"/>
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
