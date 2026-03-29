"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { useDocumentStore } from "@/store/document-store";
import type { DocumentRecord } from "@/types/documents";
import { DocumentEditorScreen } from "@/components/organizer/document-editor-screen";

const formatUpdatedAt = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const buildSnippet = (markdown: string, max = 120) => {
  const normalized = markdown.replace(/[#>*_`\-\[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Empty document";
  return normalized.length <= max ? normalized : `${normalized.slice(0, max).trimEnd()}…`;
};

const buildUntitledCounter = (documents: DocumentRecord[]) => {
  const untitledCount = documents.filter((doc) => doc.title.startsWith("Untitled Document")).length;
  return untitledCount + 1;
};

export function DocumentsListScreen() {
  const { documents, hydrated, hydrating, hydrateDocuments, createDocument, pinDocument, updateDocument } = useDocumentStore();
  const [activeDocumentId, setActiveDocumentId] = useState<number | null>(null);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateDocuments();
    }
  }, [hydrateDocuments, hydrated, hydrating]);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt)),
    [documents],
  );

  const activeDocument = sortedDocuments.find((doc) => doc.id === activeDocumentId) ?? null;

  const handleCreate = async () => {
    const next = await createDocument({
      title: `Untitled Document ${buildUntitledCounter(sortedDocuments)}`,
      bodyMarkdown: "",
      tags: ["noema", "document"],
      sourceType: "manual",
    });
    setActiveDocumentId(next.id ?? null);
  };

  const hasDocuments = sortedDocuments.length > 0;

  if (activeDocument && activeDocument.id !== undefined) {
    return (
      <DocumentEditorScreen
        document={activeDocument}
        onBack={() => setActiveDocumentId(null)}
        onUpdate={async (id, patch) => {
          await updateDocument(id, patch);
        }}
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-noema-border bg-noema-panel px-3 py-2 backdrop-blur-xl">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Documents</h2>
          <p className="text-[11px] text-slate-400">Markdown-first knowledge space</p>
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-300/30 bg-violet-500/20 px-2 py-1 text-xs font-medium text-violet-100"
        >
          <Icon icon="solar:add-circle-bold" className="text-base" />
          New
        </button>
      </div>

      {!hasDocuments ? (
        <div className="rounded-2xl border border-dashed border-noema-borderSoft bg-noema-glassStrong p-4 text-center">
          <p className="text-sm text-slate-200">No documents yet.</p>
          <p className="mt-1 text-xs text-slate-400">Create a markdown document to start organizing notes and plans.</p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="mt-3 rounded-lg border border-violet-300/30 bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-100"
          >
            Create first document
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {sortedDocuments.map((document) => {
            const open = document.id === activeDocumentId;
            return (
              <div
                key={document.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveDocumentId(document.id ?? null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveDocumentId(document.id ?? null);
                  }
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  open
                    ? "border-violet-300/35 bg-violet-500/15"
                    : "border-noema-borderSoft bg-slate-950/55 hover:border-violet-300/25 hover:bg-slate-900/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium text-slate-100">{document.title}</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    {document.isPinned && <Icon icon="solar:pin-bold" className="text-sm text-amber-300" />}
                    {document.isArchived && <Icon icon="solar:archive-bold" className="text-sm text-slate-400" />}
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-300">{buildSnippet(document.bodyMarkdown)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">Updated {formatUpdatedAt(document.updatedAt)}</p>
                  <p className="line-clamp-1 text-[11px] text-slate-500">
                    {document.folderId ? `Folder: ${document.folderId}` : document.tags.length > 0 ? `#${document.tags[0]}` : "No tag"}
                  </p>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (document.id !== undefined) {
                        void pinDocument(document.id, !document.isPinned);
                      }
                    }}
                    className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
                  >
                    {document.isPinned ? "Unpin" : "Pin"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </section>
  );
}
