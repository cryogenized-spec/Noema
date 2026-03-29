"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { ChatMessage } from "@/types/chat";

const ACTIVE_AGENT_KEY = "noema-thread-default-active-agent";

const sortMessages = (messages: ChatMessage[]) =>
  [...messages].sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    if (byDate !== 0) return byDate;
    return (a.id ?? 0) - (b.id ?? 0);
  });

const readActiveAgentId = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_AGENT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const writeActiveAgentId = (id: number | null) => {
  if (typeof window === "undefined") return;
  if (id === null) {
    window.localStorage.removeItem(ACTIVE_AGENT_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_AGENT_KEY, String(id));
};

interface ChatState {
  messages: ChatMessage[];
  activeAgentId: number | null;
  hydrated: boolean;
  hydrating: boolean;
  hydrateMessages: () => Promise<void>;
  addMessage: (message: Omit<ChatMessage, "id" | "createdAt"> & { createdAt?: string }) => Promise<ChatMessage>;
  updateMessage: (id: number, content: string) => Promise<void>;
  deleteMessage: (id: number) => Promise<void>;
  setActiveAgentId: (id: number | null) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  activeAgentId: null,
  hydrated: false,
  hydrating: false,
  hydrateMessages: async () => {
    if (get().hydrating || get().hydrated) return;

    set({ hydrating: true });

    try {
      const messages = await db.messages.toArray();
      set({ messages: sortMessages(messages), hydrated: true, activeAgentId: readActiveAgentId() });
    } finally {
      set({ hydrating: false });
    }
  },
  addMessage: async (message) => {
    const createdAt = message.createdAt ?? new Date().toISOString();
    const messageToSave: ChatMessage = {
      role: message.role,
      content: normalizeMarkdownSource(message.content),
      createdAt,
      metadata: message.metadata,
    };

    const id = await db.messages.add(messageToSave);
    const persisted = { ...messageToSave, id };

    set((state) => {
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
  setActiveAgentId: (id) => {
    writeActiveAgentId(id);
    set({ activeAgentId: id });
  },
}));
