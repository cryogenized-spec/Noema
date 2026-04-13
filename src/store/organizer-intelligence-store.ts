"use client";

import { create } from "zustand";

const ORGANIZER_AGENT_KEY = "noema-organizer-default-agent";

interface OrganizerIntelligenceState {
  hydrated: boolean;
  defaultOrganizerAgentId: number | null;
  hydrateOrganizerIntelligence: () => void;
  setDefaultOrganizerAgentId: (agentId: number | null) => void;
}

export const useOrganizerIntelligenceStore = create<OrganizerIntelligenceState>((set) => ({
  hydrated: false,
  defaultOrganizerAgentId: null,
  hydrateOrganizerIntelligence: () => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(ORGANIZER_AGENT_KEY);
    const parsed = stored ? Number(stored) : null;

    set({
      defaultOrganizerAgentId: Number.isFinite(parsed) ? parsed : null,
      hydrated: true,
    });
  },
  setDefaultOrganizerAgentId: (agentId) => {
    if (typeof window !== "undefined") {
      if (agentId === null) {
        window.localStorage.removeItem(ORGANIZER_AGENT_KEY);
      } else {
        window.localStorage.setItem(ORGANIZER_AGENT_KEY, String(agentId));
      }
    }

    set({ defaultOrganizerAgentId: agentId });
  },
}));
