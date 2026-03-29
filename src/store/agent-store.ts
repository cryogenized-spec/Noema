"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { createDefaultAgentProfile } from "@/lib/agents/defaults";
import type { AgentProfile } from "@/types/agents";

const sortAgents = (agents: AgentProfile[]) =>
  [...agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

interface AgentState {
  agents: AgentProfile[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateAgents: () => Promise<void>;
  createAgent: (seed?: Partial<AgentProfile>) => Promise<AgentProfile>;
  updateAgent: (id: number, patch: Partial<AgentProfile>) => Promise<void>;
  duplicateAgent: (id: number) => Promise<AgentProfile | null>;
  deleteAgent: (id: number) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  hydrated: false,
  hydrating: false,
  hydrateAgents: async () => {
    if (get().hydrating || get().hydrated) return;
    set({ hydrating: true });

    try {
      const agents = await db.agents.toArray();
      set({ agents: sortAgents(agents), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  createAgent: async (seed) => {
    const base = createDefaultAgentProfile();
    const now = new Date().toISOString();
    const next: AgentProfile = {
      ...base,
      ...seed,
      id: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const id = await db.agents.add(next);
    const persisted = { ...next, id };
    set((state) => ({ agents: sortAgents([persisted, ...state.agents]) }));
    return persisted;
  },
  updateAgent: async (id, patch) => {
    const updatedAt = new Date().toISOString();
    await db.agents.update(id, { ...patch, updatedAt });
    set((state) => ({
      agents: sortAgents(
        state.agents.map((agent) => (agent.id === id ? { ...agent, ...patch, updatedAt } : agent)),
      ),
    }));
  },
  duplicateAgent: async (id) => {
    const source = get().agents.find((agent) => agent.id === id);
    if (!source) return null;

    const now = new Date().toISOString();
    const duplicate: AgentProfile = {
      ...source,
      id: undefined,
      name: `${source.name} Copy`,
      createdAt: now,
      updatedAt: now,
    };

    const nextId = await db.agents.add(duplicate);
    const persisted = { ...duplicate, id: nextId };
    set((state) => ({ agents: sortAgents([persisted, ...state.agents]) }));
    return persisted;
  },
  deleteAgent: async (id) => {
    await db.agents.delete(id);
    set((state) => ({ agents: state.agents.filter((agent) => agent.id !== id) }));
  },
}));
