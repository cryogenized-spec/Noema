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
    <nav className="rounded-2xl border border-noema-border bg-noema-glassStrong px-2 py-2 backdrop-blur-xl">
      <ul className="grid grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <li key={tab.key}>
              <button
                type="button"
                className={`flex w-full flex-col items-center justify-center rounded-xl px-1 py-2 text-[11px] transition-colors ${
                  active
                    ? "border border-violet-300/30 bg-violet-500/18 text-slate-100"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
                onClick={() => onTabChange(tab.key)}
              >
                <Icon icon={tab.icon} className={`mb-1 text-lg ${active ? "text-slate-100" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
