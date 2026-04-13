"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import type { DocumentAttachmentRecord, DocumentAttachmentType } from "@/types/attachments";

interface AttachmentState {
  attachments: DocumentAttachmentRecord[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateAttachments: () => Promise<void>;
  getByDocument: (documentId: number) => DocumentAttachmentRecord[];
  createPlaceholderAttachment: (input: {
    documentId: number;
    fileName: string;
    mimeType?: string;
    type?: DocumentAttachmentType;
    localRef: string;
  }) => Promise<DocumentAttachmentRecord>;
}

export const useAttachmentStore = create<AttachmentState>((set, get) => ({
  attachments: [],
  hydrated: false,
  hydrating: false,
  hydrateAttachments: async () => {
    if (get().hydrating || get().hydrated) return;
    set({ hydrating: true });
    try {
      const attachments = await db.attachments.toArray();
      set({ attachments, hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  getByDocument: (documentId) => get().attachments.filter((attachment) => attachment.documentId === documentId),
  createPlaceholderAttachment: async (input) => {
    const now = new Date().toISOString();
    const next: DocumentAttachmentRecord = {
      documentId: input.documentId,
      type: input.type ?? "other",
      fileName: input.fileName,
      mimeType: input.mimeType ?? "application/octet-stream",
      localRef: input.localRef,
      createdAt: now,
    };
    const id = await db.attachments.add(next);
    const persisted = { ...next, id };
    set((state) => ({ attachments: [...state.attachments, persisted] }));
    return persisted;
  },
}));
