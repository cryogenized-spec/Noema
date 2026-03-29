"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { ChatMessage } from "@/types/chat";
import type { ConversationThread } from "@/types/conversation";

const DEFAULT_THREAD_KEY = "default";

const sortMessages = (messages: ChatMessage[]) =>
  [...messages].sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    if (byDate !== 0) return byDate;
    return (a.id ?? 0) - (b.id ?? 0);
  });

const buildDefaultThread = (): Omit<ConversationThread, "id"> => {
  const now = new Date().toISOString();
  return {
    threadKey: DEFAULT_THREAD_KEY,
    title: "Main",
    participants: [
      { id: "self", role: "self", isLocal: true, displayName: "You" },
      { id: "agent", role: "agent", isLocal: true, displayName: "Noema Agent" },
    ],
    selectedAgentId: null,
    transportHint: "local",
    syncState: { status: "local_only" },
    createdAt: now,
    updatedAt: now,
  };
};

interface ChatState {
  threads: ConversationThread[];
  activeThreadKey: string;
  messages: ChatMessage[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateMessages: () => Promise<void>;
  addMessage: (
    message: Omit<ChatMessage, "id" | "createdAt" | "threadKey" | "kind" | "author" | "delivery"> & {
      createdAt?: string;
      threadKey?: string;
      kind?: ChatMessage["kind"];
      author?: ChatMessage["author"];
      delivery?: ChatMessage["delivery"];
    },
  ) => Promise<ChatMessage>;
  updateMessage: (id: number, content: string) => Promise<void>;
  deleteMessage: (id: number) => Promise<void>;
  setActiveThread: (threadKey: string) => Promise<void>;
  setThreadAgentId: (threadKey: string, id: number | null) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [],
  activeThreadKey: DEFAULT_THREAD_KEY,
  messages: [],
  hydrated: false,
  hydrating: false,
  hydrateMessages: async () => {
    if (get().hydrating || get().hydrated) return;

    set({ hydrating: true });

    try {
      let threads = await db.threads.toArray();
      if (threads.length === 0) {
        const id = await db.threads.add(buildDefaultThread());
        const created = await db.threads.get(id);
        threads = created ? [created] : [];
      }

      const activeThreadKey = threads[0]?.threadKey ?? DEFAULT_THREAD_KEY;
      const messages = await db.messages.where("threadKey").equals(activeThreadKey).toArray();
      set({ threads, activeThreadKey, messages: sortMessages(messages), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  addMessage: async (message) => {
    const threadKey = message.threadKey ?? get().activeThreadKey;
    const createdAt = message.createdAt ?? new Date().toISOString();
    const messageToSave: ChatMessage = {
      role: message.role,
      kind: message.kind ?? (message.role === "system" ? "system" : message.role === "agent" ? "agent" : "user"),
      threadKey,
      content: normalizeMarkdownSource(message.content),
      createdAt,
      author:
        message.author ?? {
          participantId: message.role === "agent" ? "agent" : message.role === "system" ? "system" : "self",
          isLocal: true,
          transport: "local",
        },
      delivery: message.delivery ?? { state: "local_only" },
      metadata: message.metadata,
    };

    const id = await db.messages.add(messageToSave);
    const persisted = { ...messageToSave, id };

    await db.threads.where("threadKey").equals(threadKey).modify({ updatedAt: createdAt });

    set((state) => {
      if (threadKey !== state.activeThreadKey) return state;
      const merged = [...state.messages.filter((item) => item.id !== id), persisted];
      return { messages: sortMessages(merged) };
    });

    return persisted;
  },
  updateMessage: async (id, content) => {
    const normalized = normalizeMarkdownSource(content);
    await db.messages.update(id, { content: normalized });
    set((state) => ({
      messages: sortMessages(
        state.messages.map((item) =>
          item.id === id
            ? {
                ...item,
                content: normalized,
              }
            : item,
        ),
      ),
    }));
  },
  deleteMessage: async (id) => {
    await db.messages.delete(id);
    set((state) => ({ messages: state.messages.filter((item) => item.id !== id) }));
  },
  setActiveThread: async (threadKey) => {
    const messages = await db.messages.where("threadKey").equals(threadKey).toArray();
    set({ activeThreadKey: threadKey, messages: sortMessages(messages) });
  },
  setThreadAgentId: async (threadKey, id) => {
    await db.threads.where("threadKey").equals(threadKey).modify({ selectedAgentId: id, updatedAt: new Date().toISOString() });
    set((state) => ({
      threads: state.threads.map((thread) => (thread.threadKey === threadKey ? { ...thread, selectedAgentId: id } : thread)),
    }));
  },
}));
