'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { ChatScreen } from '@/components/chat/chat-screen';

const tabs = [
  { key: 'chat', label: 'Chat', icon: 'solar:chat-round-dots-linear' },
  { key: 'signals', label: 'Signals', icon: 'solar:bell-line-duotone' },
  { key: 'agents', label: 'Agents', icon: 'solar:stars-line-duotone' },
  { key: 'organizer', label: 'Organizer', icon: 'solar:checklist-line-duotone' },
  { key: 'settings', label: 'Settings', icon: 'solar:settings-line-duotone' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

function Placeholder({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-noema-stroke bg-noema-panel/60 px-6 text-center shadow-panel backdrop-blur-xl">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 max-w-xs text-sm text-noema-muted">{copy}</p>
    </div>
  );
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabKey>('chat');

  const screen = useMemo(() => {
    switch (activeTab) {
      case 'chat':
        return <ChatScreen />;
      case 'signals':
        return <Placeholder title="Signals" copy="Your monitored events and smart alerts will appear here." />;
      case 'agents':
        return <Placeholder title="Agents" copy="Configure and run specialized assistants from this workspace." />;
      case 'organizer':
        return <Placeholder title="Organizer" copy="Tasks, notes, and routines are intentionally deferred for this slice." />;
      case 'settings':
        return <Placeholder title="Settings" copy="Privacy, storage, and provider settings will live here." />;
      default:
        return null;
    }
  }, [activeTab]);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <header className="mb-3 rounded-2xl border border-noema-stroke bg-noema-panel/70 px-4 py-3 shadow-panel backdrop-blur-xl">
        <h1 className="text-lg font-semibold tracking-wide">Noema</h1>
      </header>

      <section className="min-h-0 flex-1">{screen}</section>

      <nav className="mt-3 grid grid-cols-5 rounded-3xl border border-noema-stroke bg-noema-panel/75 p-1 shadow-panel backdrop-blur-xl">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                active ? 'bg-white/10 text-white' : 'text-noema-muted'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon icon={tab.icon} className="text-lg" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
