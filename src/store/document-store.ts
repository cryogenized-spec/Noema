"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { createDocumentRecord } from "@/lib/documents/contract";
import { normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { CreateDocumentInput, DocumentRecord } from "@/types/documents";

const sortDocuments = (docs: DocumentRecord[]) => [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

interface DocumentState {
  documents: DocumentRecord[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateDocuments: () => Promise<void>;
  createDocument: (input: CreateDocumentInput) => Promise<DocumentRecord>;
  updateDocument: (id: number, patch: Partial<CreateDocumentInput>) => Promise<void>;
  archiveDocument: (id: number, isArchived: boolean) => Promise<void>;
  pinDocument: (id: number, isPinned: boolean) => Promise<void>;
  deleteDocument: (id: number) => Promise<void>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  hydrated: false,
  hydrating: false,
  hydrateDocuments: async () => {
    if (get().hydrating || get().hydrated) return;
    set({ hydrating: true });
    try {
      const docs = await db.documents.toArray();
      set({ documents: sortDocuments(docs), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  createDocument: async (input) => {
    const record = createDocumentRecord(input);
    const id = await db.documents.add(record);
    const persisted = { ...record, id };
    set((state) => ({ documents: sortDocuments([persisted, ...state.documents]) }));
    return persisted;
  },
  updateDocument: async (id, patch) => {
    const current = get().documents.find((doc) => doc.id === id);
    if (!current) return;

    const updatedAt = new Date().toISOString();
    const next: Partial<DocumentRecord> = {
      title: patch.title?.trim() ?? current.title,
      bodyMarkdown: patch.bodyMarkdown !== undefined ? normalizeMarkdownSource(patch.bodyMarkdown) : undefined,
      summary: patch.summary,
      tags: patch.tags,
      folderId: patch.folderId,
      isPinned: patch.isPinned,
      isArchived: patch.isArchived,
      sourceType: patch.sourceType,
      sourceRef: patch.sourceRef,
      frontmatterEnabled: patch.frontmatterEnabled,
      updatedAt,
    };

    await db.documents.update(id, next);
    set((state) => ({
      documents: sortDocuments(
        state.documents.map((doc) =>
          doc.id === id
            ? {
                ...doc,
                ...next,
                bodyMarkdown: next.bodyMarkdown ?? doc.bodyMarkdown,
              }
            : doc,
        ),
      ),
    }));
  },
  archiveDocument: async (id, isArchived) => {
    const updatedAt = new Date().toISOString();
    await db.documents.update(id, { isArchived, updatedAt });
    set((state) => ({
      documents: sortDocuments(state.documents.map((doc) => (doc.id === id ? { ...doc, isArchived, updatedAt } : doc))),
    }));
  },
  pinDocument: async (id, isPinned) => {
    const updatedAt = new Date().toISOString();
    await db.documents.update(id, { isPinned, updatedAt });
    set((state) => ({
      documents: sortDocuments(state.documents.map((doc) => (doc.id === id ? { ...doc, isPinned, updatedAt } : doc))),
    }));
  },
  deleteDocument: async (id) => {
    await db.documents.delete(id);
    set((state) => ({ documents: state.documents.filter((doc) => doc.id !== id) }));
  },
}));
