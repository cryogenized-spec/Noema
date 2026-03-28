'use client';

import { create } from 'zustand';
import type { ChatMessage, MessageRole } from '@/types/message';
import { getDb } from '@/lib/db/client';

interface ChatState {
  messages: ChatMessage[];
  hydrated: boolean;
  loadingAgent: boolean;
  hydrate: () => Promise<void>;
  addMessage: (content: string, role: MessageRole, metadata?: ChatMessage['metadata']) => Promise<ChatMessage>;
  askAgentForMessage: (message: ChatMessage) => Promise<void>;
}

const buildMessage = (
  role: MessageRole,
  content: string,
  metadata?: ChatMessage['metadata'],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  metadata,
  createdAt: new Date().toISOString(),
});

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  hydrated: false,
  loadingAgent: false,
  hydrate: async () => {
    if (get().hydrated) {
      return;
    }

    const db = getDb();

    if (!db) {
      set({ hydrated: true });
      return;
    }

    const messages = await db.messages.orderBy('createdAt').toArray();
    set({ messages, hydrated: true });
  },
  addMessage: async (content, role, metadata) => {
    const message = buildMessage(role, content, metadata);
    const db = getDb();

    set((state) => ({ messages: [...state.messages, message] }));

    if (db) {
      await db.messages.put(message);
    }

    return message;
  },
  askAgentForMessage: async (message) => {
    set({ loadingAgent: true });

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Help me with this: ${message.content}`,
          messageContext: message.content,
        }),
      });

      const data = (await response.json()) as { content?: string; error?: string };

      if (!response.ok || !data.content) {
        throw new Error(data.error ?? 'Agent response was empty.');
      }

      await get().addMessage(data.content, 'agent', { sourceMessageId: message.id });
    } catch (error) {
      await get().addMessage(
        `Agent could not complete the request. ${error instanceof Error ? error.message : ''}`,
        'system',
      );
    } finally {
      set({ loadingAgent: false });
    }
  },
}));
