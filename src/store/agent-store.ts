"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { createDefaultAgentProfile } from "@/lib/agents/defaults";
import { normalizeAgentRoles, roleTransferPlan } from "@/lib/agents/role-routing";
import type { AgentProfile, AgentRole } from "@/types/agents";

const sortAgents = (agents: AgentProfile[]) =>
  [...agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const refresh = async () => sortAgents(await db.agents.toArray());

/** Within the same read/write transaction, remove transferred pins from all
 * other agents before assigning them. Persisted in IndexedDB, not just UI state.
 */
async function transferAssignments(target: number, roles: AgentRole[], now: string) {
  const agents = await db.agents.toArray();
  for (const other of roleTransferPlan(agents, target, roles)) {
    await db.agents.update(other.id, { roleAssignments: other.roleAssignments, updatedAt: now });
  }
}

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
      const agents = await refresh();
      set({ agents, hydrated: true });
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
      roleAssignments: normalizeAgentRoles(seed?.roleAssignments),
      guestVisibility: seed?.guestVisibility === "invited" ? "invited" : "private",
      createdAt: now,
      updatedAt: now,
    };
    let id = -1;
    await db.transaction("rw", db.agents, async () => {
      await transferAssignments(-1, next.roleAssignments ?? [], now);
      const addedId = await db.agents.add(next);
      if (addedId === undefined) throw new Error("Could not allocate agent ID.");
      id = addedId;
    });
    const persisted = { ...next, id };
    set({ agents: await refresh() });
    return persisted;
  },
  updateAgent: async (id, patch) => {
    if (patch.id !== undefined && patch.id !== id) throw new Error("Agent ID cannot be changed.");
    const now = new Date().toISOString();
    await db.transaction("rw", db.agents, async () => {
      const existing = await db.agents.get(id);
      if (!existing) throw new Error("Agent no longer exists.");
      const roles = patch.roleAssignments !== undefined ? normalizeAgentRoles(patch.roleAssignments) : undefined;
      if (roles !== undefined) await transferAssignments(id, roles, now);
      await db.agents.update(id, {
        ...patch,
        roleAssignments: roles ?? normalizeAgentRoles(existing.roleAssignments),
        guestVisibility: patch.guestVisibility === "invited" ? "invited" : patch.guestVisibility === "private"
          ? "private" : existing.guestVisibility ?? "private",
        updatedAt: now,
      });
    });
    set({ agents: await refresh() });
  },
  duplicateAgent: async (id) => {
    const source = await db.agents.get(id);
    if (!source) return null;
    const now = new Date().toISOString();
    // Never clone routing assignments or guest-facing settings by accident.
    const duplicate: AgentProfile = {
      ...source,
      id: undefined,
      name: `${source.name} Copy`,
      roleAssignments: [],
      guestVisibility: "private",
      createdAt: now,
      updatedAt: now,
    };
    const nextId = await db.agents.add(duplicate);
    if (nextId === undefined) throw new Error("Could not duplicate agent.");
    set({ agents: await refresh() });
    return { ...duplicate, id: nextId };
  },
  deleteAgent: async (id) => {
    await db.agents.delete(id);
    set({ agents: await refresh() });
  },
}));
