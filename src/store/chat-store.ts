"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import type { ChatMessage } from "@/types/chat";

const sortMessages = (messages: ChatMessage[]) =>
  [...messages].sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    if (byDate !== 0) return byDate;
    return (a.id ?? 0) - (b.id ?? 0);
  });

interface ChatState {
  messages: ChatMessage[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateMessages: () => Promise<void>;
  addMessage: (message: Omit<ChatMessage, "id" | "createdAt"> & { createdAt?: string }) => Promise<ChatMessage>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  hydrated: false,
  hydrating: false,
  hydrateMessages: async () => {
    if (get().hydrating || get().hydrated) return;

    set({ hydrating: true });

    try {
      const messages = await db.messages.toArray();
      set({ messages: sortMessages(messages), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  addMessage: async (message) => {
    const createdAt = message.createdAt ?? new Date().toISOString();
    const messageToSave: ChatMessage = {
      role: message.role,
      content: message.content,
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
}));
