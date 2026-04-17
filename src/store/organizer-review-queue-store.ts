"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";
import type { OrganizerReviewItemRecord, OrganizerReviewSource, OrganizerReviewStatus } from "@/types/organizer-review";

interface EnqueueOrganizerDraftsInput {
  drafts: OrganizerDraftEnvelope[];
  source: OrganizerReviewSource;
  sourceLabel: string;
  sourceRef?: string;
}

interface OrganizerReviewQueueState {
  items: OrganizerReviewItemRecord[];
  hydrated: boolean;
  hydrating: boolean;
  hydrate: () => Promise<void>;
  enqueueDrafts: (input: EnqueueOrganizerDraftsInput) => Promise<void>;
  updateDraft: (id: number, draft: OrganizerDraftEnvelope) => Promise<void>;
  setStatus: (id: number, status: OrganizerReviewStatus) => Promise<void>;
  pendingCount: () => number;
}

const sortItems = (items: OrganizerReviewItemRecord[]) => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const previewFromDraft = (draft: OrganizerDraftEnvelope) => {
  if ("draft" in draft.payload) {
    const item = draft.payload.draft as { title?: string; descriptionMarkdown?: string; bodyMarkdown?: string };
    return (item.title ?? item.descriptionMarkdown ?? item.bodyMarkdown ?? "Untitled proposal").slice(0, 140);
  }

  if ("suggestions" in draft.payload) {
    return (draft.payload.suggestions.note ?? "Metadata suggestion").slice(0, 140);
  }

  if ("subtasks" in draft.payload) {
    const first = draft.payload.subtasks[0]?.title ?? "Subtask suggestions";
    return `${first}${draft.payload.subtasks.length > 1 ? ` (+${draft.payload.subtasks.length - 1})` : ""}`;
  }

  return "Organizer proposal";
};

const queueKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `review-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

export const useOrganizerReviewQueueStore = create<OrganizerReviewQueueState>((set, get) => ({
  items: [],
  hydrated: false,
  hydrating: false,
  hydrate: async () => {
    if (get().hydrating || get().hydrated) return;
    set({ hydrating: true });
    try {
      const items = await db.organizerReviewQueue.toArray();
      set({ items: sortItems(items), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  enqueueDrafts: async ({ drafts, source, sourceLabel, sourceRef }) => {
    const now = new Date().toISOString();
    const records: OrganizerReviewItemRecord[] = drafts.map((draft) => ({
      queueKey: queueKey(),
      status: "pending",
      source,
      sourceLabel,
      sourceRef,
      selectedAgentId: draft.source.selectedAgentId,
      draft,
      preview: previewFromDraft(draft),
      createdAt: now,
      updatedAt: now,
    }));

    if (!records.length) return;
    const ids = await db.organizerReviewQueue.bulkAdd(records, { allKeys: true });
    const persisted = records.map((record, index) => ({ ...record, id: Number(ids[index]) }));
    set((state) => ({ items: sortItems([...persisted, ...state.items]) }));
  },
  updateDraft: async (id, draft) => {
    const current = get().items.find((item) => item.id === id);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    const patch: Partial<OrganizerReviewItemRecord> = {
      draft,
      preview: previewFromDraft(draft),
      updatedAt,
    };
    await db.organizerReviewQueue.update(id, patch);
    set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  },
  setStatus: async (id, status) => {
    const updatedAt = new Date().toISOString();
    await db.organizerReviewQueue.update(id, { status, updatedAt });
    set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, status, updatedAt } : item)) }));
  },
  pendingCount: () => get().items.filter((item) => item.status === "pending").length,
}));
