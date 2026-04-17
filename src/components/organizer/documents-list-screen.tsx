"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useDocumentStore } from "@/store/document-store";
import type { DocumentRecord } from "@/types/documents";
import { DocumentEditorScreen } from "@/components/organizer/document-editor-screen";
import { DOCUMENT_CONVERSION_HOOKS } from "@/lib/documents/conversion-hooks";

type DocumentsFilter = "all" | "pinned" | "archived";

const LONG_PRESS_MS = 420;

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

const filterLabels: Record<DocumentsFilter, string> = {
  all: "All",
  pinned: "Pinned",
  archived: "Archived",
};

export function DocumentsListScreen() {
  const {
    documents,
    hydrated,
    hydrating,
    hydrateDocuments,
    createDocument,
    pinDocument,
    archiveDocument,
    updateDocument,
    deleteDocument,
  } = useDocumentStore();

  const [activeDocumentId, setActiveDocumentId] = useState<number | null>(null);
  const [openIntelligenceOnMount, setOpenIntelligenceOnMount] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DocumentsFilter>("all");
  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [actionDocument, setActionDocument] = useState<DocumentRecord | null>(null);
  const [notice, setNotice] = useState<string>("");
  const longPressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateDocuments();
    }
  }, [hydrateDocuments, hydrated, hydrating]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt)),
    [documents],
  );

  const availableFolders = useMemo(
    () => Array.from(new Set(sortedDocuments.map((doc) => doc.folderId).filter((folder): folder is string => Boolean(folder)))),
    [sortedDocuments],
  );

  const filteredDocuments = useMemo(() => {
    let base = sortedDocuments;
    if (activeFilter === "all") {
      base = base.filter((doc) => !doc.isArchived);
    } else if (activeFilter === "pinned") {
      base = base.filter((doc) => doc.isPinned && !doc.isArchived);
    } else if (activeFilter === "archived") {
      base = base.filter((doc) => doc.isArchived);
    }

    if (activeFolderFilter) {
      base = base.filter((doc) => doc.folderId === activeFolderFilter);
    }

    return base;
  }, [sortedDocuments, activeFilter, activeFolderFilter]);

  const selectedDocuments = useMemo(
    () => sortedDocuments.filter((document) => document.id !== undefined && selectedIds.includes(document.id)),
    [sortedDocuments, selectedIds],
  );

  const selectedCount = selectedIds.length;
  const activeDocument = sortedDocuments.find((doc) => doc.id === activeDocumentId) ?? null;

  useEffect(() => {
    if (!selectionMode) return;

    const validIds = new Set(sortedDocuments.map((doc) => doc.id).filter((id): id is number => id !== undefined));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [sortedDocuments, selectionMode]);

  useEffect(() => {
    if (selectionMode && selectedIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedIds.length]);

  const handleCreate = async () => {
    const next = await createDocument({
      title: `Untitled Document ${buildUntitledCounter(sortedDocuments)}`,
      bodyMarkdown: "",
      tags: ["noema", "document"],
      sourceType: "manual",
    });
    setActiveFilter("all");
    setActiveDocumentId(next.id ?? null);
  };

  const clearSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelectDocument = (document: DocumentRecord) => {
    if (document.id === undefined) return;
    setSelectedIds((current) =>
      current.includes(document.id as number)
        ? current.filter((id) => id !== document.id)
        : [...current, document.id as number],
    );
  };

  const enterSelectionMode = (document: DocumentRecord) => {
    if (document.id === undefined) return;
    setSelectionMode(true);
    setSelectedIds((current) => (current.includes(document.id as number) ? current : [...current, document.id as number]));
    setActionDocument(null);
  };

  const startLongPress = (document: DocumentRecord) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      enterSelectionMode(document);
    }, LONG_PRESS_MS);
  };

  const endLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const bulkArchive = async (isArchived: boolean) => {
    await Promise.all(selectedDocuments.flatMap((doc) => (doc.id !== undefined ? [archiveDocument(doc.id, isArchived)] : [])));
    clearSelectionMode();
  };

  const bulkPin = async (isPinned: boolean) => {
    await Promise.all(selectedDocuments.flatMap((doc) => (doc.id !== undefined ? [pinDocument(doc.id, isPinned)] : [])));
    clearSelectionMode();
  };

  const bulkDelete = async () => {
    await Promise.all(selectedDocuments.flatMap((doc) => (doc.id !== undefined ? [deleteDocument(doc.id)] : [])));
    clearSelectionMode();
  };

  const handleRename = async (document: DocumentRecord) => {
    if (document.id === undefined) return;
    const nextTitle = window.prompt("Rename document", document.title)?.trim();
    if (!nextTitle) return;
    await updateDocument(document.id, { title: nextTitle });
    setActionDocument(null);
  };

  const handleDuplicate = async (document: DocumentRecord) => {
    await createDocument({
      title: `${document.title} Copy`,
      bodyMarkdown: document.bodyMarkdown,
      summary: document.summary,
      tags: document.tags,
      folderId: document.folderId,
      isPinned: document.isPinned,
      isArchived: false,
      sourceType: document.sourceType,
      sourceRef: document.sourceRef,
      frontmatterEnabled: document.frontmatterEnabled,
    });
    setActionDocument(null);
  };

  const hasDocuments = filteredDocuments.length > 0;

  if (activeDocument && activeDocument.id !== undefined) {
    return (
      <DocumentEditorScreen
        document={activeDocument}
        openIntelligenceOnMount={openIntelligenceOnMount}
        onBack={() => {
          setOpenIntelligenceOnMount(false);
          setActiveDocumentId(null);
        }}
        onUpdate={async (id, patch) => {
          await updateDocument(id, patch);
        }}
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      {selectionMode && (
        <div className="rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-100">{selectedCount} selected</p>
            <button type="button" onClick={clearSelectionMode} className="text-xs text-slate-400">
              Close
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => void bulkArchive(activeFilter !== "archived")}
              className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300"
            >
              {activeFilter === "archived" ? "Unarchive" : "Archive"}
            </button>
            <button type="button" onClick={() => void bulkPin(true)} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
              Pin
            </button>
            <button type="button" onClick={() => void bulkDelete()} className="rounded-md border border-rose-300/30 px-2 py-1 text-[11px] text-rose-200">
              Delete
            </button>
            <button
              type="button"
              onClick={() => setNotice("Bulk export packaging is planned for Notes/ and Assets/ vault structure.")}
              className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300"
            >
              Export (Soon)
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Documents</h2>
            <p className="text-[11px] text-slate-400">Metadata-aware markdown library</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNotice("Create from OCR will be enabled when capture pipeline lands.")}
              className="inline-flex items-center gap-1 rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-300"
            >
              <Icon icon="solar:scanner-2-bold" className="text-base" />
              OCR (Soon)
            </button>
            <button
              type="button"
              onClick={() => setNotice("Markdown import parser groundwork is ready; import picker UI is coming soon.")}
              className="inline-flex items-center gap-1 rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-300"
            >
              <Icon icon="solar:inbox-in-bold" className="text-base" />
              Import (Soon)
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300/30 bg-violet-500/20 px-2 py-1 text-xs font-medium text-violet-100"
            >
              <Icon icon="solar:add-circle-bold" className="text-base" />
              New
            </button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {(Object.keys(filterLabels) as DocumentsFilter[]).map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              onClick={() => setActiveFilter(filterKey)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${
                activeFilter === filterKey
                  ? "border-violet-300/35 bg-violet-500/20 text-violet-100"
                  : "border-noema-borderSoft text-slate-300"
              }`}
            >
              {filterLabels[filterKey]}
            </button>
          ))}
        </div>

        {availableFolders.length > 0 && (
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveFolderFilter(null)}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                activeFolderFilter === null ? "border-sky-300/35 text-sky-200" : "border-noema-borderSoft text-slate-400"
              }`}
            >
              All folders
            </button>
            {availableFolders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => setActiveFolderFilter(folder)}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                  activeFolderFilter === folder ? "border-sky-300/35 text-sky-200" : "border-noema-borderSoft text-slate-400"
                }`}
              >
                {folder}
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasDocuments ? (
        <div className="rounded-2xl border border-dashed border-noema-borderSoft bg-noema-glassStrong p-4 text-center">
          <p className="text-sm text-slate-200">No documents in this view.</p>
          <p className="mt-1 text-xs text-slate-400">Create or unarchive documents to populate this list.</p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="mt-3 rounded-lg border border-violet-300/30 bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-100"
          >
            Create document
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {filteredDocuments.map((document) => {
            const selected = document.id !== undefined && selectedIds.includes(document.id);
            return (
              <div
                key={document.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelectDocument(document);
                    return;
                  }
                  setActiveDocumentId(document.id ?? null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (!selectionMode) setActionDocument(document);
                }}
                onTouchStart={() => {
                  if (!selectionMode) startLongPress(document);
                }}
                onTouchMove={endLongPress}
                onTouchEnd={endLongPress}
                onTouchCancel={endLongPress}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (selectionMode) {
                      toggleSelectDocument(document);
                    } else {
                      setActiveDocumentId(document.id ?? null);
                    }
                  }
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-violet-300/45 bg-violet-500/18"
                    : "border-noema-borderSoft bg-slate-950/55 hover:border-violet-300/25 hover:bg-slate-900/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium text-slate-100">{document.title}</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    {selected && <Icon icon="solar:check-circle-bold" className="text-sm text-violet-200" />}
                    {document.isPinned && <Icon icon="solar:pin-bold" className="text-sm text-amber-300" />}
                    {document.isArchived && <Icon icon="solar:archive-bold" className="text-sm text-slate-400" />}
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">{buildSnippet(document.bodyMarkdown)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">Updated {formatUpdatedAt(document.updatedAt)}</p>
                  {document.folderId ? (
                    <span className="rounded-full border border-sky-300/25 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
                      {document.folderId}
                    </span>
                  ) : (
                    <p className="line-clamp-1 text-[11px] text-slate-500">No folder</p>
                  )}
                </div>
                {document.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {document.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full border border-violet-300/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-100">
                        #{tag}
                      </span>
                    ))}
                    {document.tags.length > 3 && <span className="text-[10px] text-slate-500">+{document.tags.length - 3} more</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {notice && <div className="rounded-xl border border-noema-borderSoft bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{notice}</div>}

      {actionDocument && !selectionMode && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45" onClick={() => setActionDocument(null)}>
          <div
            className="w-full rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6 shadow-glass"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
            <p className="mb-2 text-xs text-slate-400">{actionDocument.title}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200"
                onClick={() => {
                  setActiveDocumentId(actionDocument.id ?? null);
                  setActionDocument(null);
                }}
              >
                Open
              </button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={() => void handleRename(actionDocument)}>Rename</button>
              <button
                type="button"
                className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200"
                onClick={() => {
                  if (actionDocument.id !== undefined) {
                    void pinDocument(actionDocument.id, !actionDocument.isPinned);
                  }
                  setActionDocument(null);
                }}
              >
                {actionDocument.isPinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200"
                onClick={() => {
                  if (actionDocument.id !== undefined) {
                    void archiveDocument(actionDocument.id, !actionDocument.isArchived);
                  }
                  setActionDocument(null);
                }}
              >
                {actionDocument.isArchived ? "Unarchive" : "Archive"}
              </button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={() => void handleDuplicate(actionDocument)}>
                Duplicate
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-300/30 px-2 py-2 text-rose-200"
                onClick={() => {
                  if (actionDocument.id !== undefined) {
                    void deleteDocument(actionDocument.id);
                  }
                  setActionDocument(null);
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="col-span-2 rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-300"
                onClick={() => {
                  setNotice("Document export will target Obsidian-style Notes/ and Assets/ layout.");
                  setActionDocument(null);
                }}
              >
                Export (Soon)
              </button>
              <button
                type="button"
                className="col-span-2 rounded-lg border border-violet-300/30 bg-violet-500/15 px-2 py-2 text-violet-100"
                onClick={() => {
                  setOpenIntelligenceOnMount(true);
                  setActiveDocumentId(actionDocument.id ?? null);
                  setActionDocument(null);
                }}
              >
                Intelligence actions
              </button>
            </div>
            <div className="mt-3 border-t border-noema-borderSoft pt-2 text-[11px] text-slate-400">
              Future conversions: {DOCUMENT_CONVERSION_HOOKS.map((hook) => hook.label).join(" • ")}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
