'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageMenu } from '@/components/chat/message-menu';
import { useChatStore } from '@/store/chat-store';
import type { ChatMessage } from '@/types/message';

interface MenuState {
  open: boolean;
  message: ChatMessage | null;
  x: number;
  y: number;
}

export function ChatScreen() {
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<MenuState>({ open: false, message: null, x: 0, y: 0 });
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { messages, hydrated, loadingAgent, hydrate, addMessage, askAgentForMessage } = useChatStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  const submit = async () => {
    if (!canSend) {
      return;
    }

    const content = draft.trim();
    setDraft('');
    await addMessage(content, 'user');
  };

  return (
    <div className="relative flex h-full flex-col rounded-3xl border border-noema-stroke bg-noema-panel/70 shadow-panel backdrop-blur-xl">
      <div className="noema-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!hydrated ? <p className="text-sm text-noema-muted">Loading local messages…</p> : null}
        {hydrated && messages.length === 0 ? (
          <p className="rounded-2xl border border-noema-stroke/70 bg-black/10 px-3 py-2 text-sm text-noema-muted">
            Start your first thread. Long-press any message for quick actions.
          </p>
        ) : null}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onLongPress={(selectedMessage, coordinates) =>
              setMenu({ open: true, message: selectedMessage, x: coordinates.x, y: coordinates.y })
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-noema-stroke p-2">
        <div className="flex items-end gap-2 rounded-2xl border border-noema-stroke bg-black/15 p-2">
          <button type="button" className="rounded-xl p-2 text-noema-muted hover:bg-white/10" aria-label="Attachment coming soon">
            <Icon icon="solar:paperclip-linear" className="text-xl" />
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Message Noema"
            rows={1}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-noema-muted"
          />
          <button type="button" className="rounded-xl p-2 text-noema-muted hover:bg-white/10" aria-label="Voice input coming soon">
            <Icon icon="solar:microphone-3-linear" className="text-xl" />
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            className="rounded-xl bg-indigo-400/70 p-2 text-white transition enabled:hover:bg-indigo-300 disabled:opacity-50"
            aria-label="Send message"
          >
            <Icon icon="solar:arrow-up-linear" className="text-xl" />
          </button>
        </div>
      </div>

      <MessageMenu
        isOpen={menu.open}
        anchor={{ x: menu.x, y: menu.y }}
        onClose={() => setMenu({ open: false, message: null, x: 0, y: 0 })}
        onCopy={() => {
          if (menu.message) {
            navigator.clipboard.writeText(menu.message.content);
          }
          setMenu({ open: false, message: null, x: 0, y: 0 });
        }}
        onAskAgent={() => {
          if (menu.message) {
            void askAgentForMessage(menu.message);
          }
          setMenu({ open: false, message: null, x: 0, y: 0 });
        }}
      />

      {loadingAgent ? (
        <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-noema-stroke bg-[#111937]/90 px-3 py-1 text-xs text-noema-muted shadow-panel">
          Agent thinking…
        </p>
      ) : null}
    </div>
  );
}
