"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import type { DocumentRecord } from "@/types/documents";
import { useAttachmentStore } from "@/store/attachment-store";
import { extractDocumentAttachmentReferences, resolveAttachmentByTarget } from "@/lib/documents/attachments";

interface DocumentEditorScreenProps {
  document: DocumentRecord;
  onBack: () => void;
  onUpdate: (
    id: number,
    patch: {
      title?: string;
      bodyMarkdown?: string;
      folderId?: string;
      tags?: string[];
      isPinned?: boolean;
      isArchived?: boolean;
    },
  ) => Promise<void>;
}

type EditorMode = "edit" | "preview";

const formatSaved = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const normalizeTags = (value: string[]) => Array.from(new Set(value.map((tag) => tag.trim()).filter(Boolean)));

export function DocumentEditorScreen({ document, onBack, onUpdate }: DocumentEditorScreenProps) {
  const [mode, setMode] = useState<EditorMode>("edit");
  const [title, setTitle] = useState(document.title);
  const [bodyMarkdown, setBodyMarkdown] = useState(document.bodyMarkdown);
  const [folderId, setFolderId] = useState(document.folderId ?? "");
  const [tags, setTags] = useState(document.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [isPinned, setIsPinned] = useState(document.isPinned);
  const [isArchived, setIsArchived] = useState(document.isArchived);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(document.updatedAt);
  const { hydrateAttachments, getByDocument, hydrated: attachmentsHydrated, hydrating: attachmentsHydrating } = useAttachmentStore();

  useEffect(() => {
    if (!attachmentsHydrated && !attachmentsHydrating) {
      void hydrateAttachments();
    }
  }, [hydrateAttachments, attachmentsHydrated, attachmentsHydrating]);


  useEffect(() => {
    setTitle(document.title);
    setBodyMarkdown(document.bodyMarkdown);
    setFolderId(document.folderId ?? "");
    setTags(document.tags);
    setIsPinned(document.isPinned);
    setIsArchived(document.isArchived);
    setLastSavedAt(document.updatedAt);
    setMode("edit");
  }, [document]);

  const normalizedTags = useMemo(() => normalizeTags(tags), [tags]);
  const normalizedDocTags = useMemo(() => normalizeTags(document.tags), [document.tags]);

  const dirty = useMemo(
    () =>
      title !== document.title ||
      bodyMarkdown !== document.bodyMarkdown ||
      folderId !== (document.folderId ?? "") ||
      JSON.stringify(normalizedTags) !== JSON.stringify(normalizedDocTags) ||
      isPinned !== document.isPinned ||
      isArchived !== document.isArchived,
    [title, bodyMarkdown, folderId, normalizedTags, normalizedDocTags, isPinned, isArchived, document],
  );

  useEffect(() => {
    if (!dirty || document.id === undefined) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        setIsSaving(true);
        try {
          await onUpdate(document.id as number, {
            title,
            bodyMarkdown,
            folderId: folderId.trim() || undefined,
            tags: normalizedTags,
            isPinned,
            isArchived,
          });
          setLastSavedAt(new Date().toISOString());
        } finally {
          setIsSaving(false);
        }
      })();
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [dirty, document.id, onUpdate, title, bodyMarkdown, folderId, normalizedTags, isPinned, isArchived]);

  const linkedAttachments = document.id !== undefined ? getByDocument(document.id) : [];
  const markdownRefs = extractDocumentAttachmentReferences(bodyMarkdown);
  const matchedRefs = markdownRefs.map((ref) => ({
    ...ref,
    attachment: resolveAttachmentByTarget(linkedAttachments, ref.target),
  }));

  const addTag = () => {
    const next = tagDraft.trim().replace(/^#/, "");
    if (!next) return;
    setTags((current) => normalizeTags([...current, next]));
    setTagDraft("");
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-noema-border bg-noema-panel p-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-300"
          >
            <Icon icon="solar:alt-arrow-left-bold" className="text-sm" />
            Back
          </button>
          <div className="rounded-lg border border-noema-borderSoft bg-slate-950/70 p-1">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`rounded-md px-2 py-1 text-xs ${mode === "edit" ? "bg-violet-500/20 text-violet-100" : "text-slate-400"}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded-md px-2 py-1 text-xs ${mode === "preview" ? "bg-violet-500/20 text-violet-100" : "text-slate-400"}`}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Document title"
            className="w-full rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
              placeholder="Folder (optional)"
              className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <div className="flex gap-1">
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag"
                className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-300"
              >
                Add
              </button>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                  className="rounded-full border border-violet-300/25 bg-violet-500/12 px-2 py-0.5 text-[11px] text-violet-100"
                >
                  #{tag} ×
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPinned((current) => !current)}
              className={`rounded-md border px-2 py-1 text-[11px] ${isPinned ? "border-amber-300/40 text-amber-200" : "border-noema-borderSoft text-slate-300"}`}
            >
              {isPinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => setIsArchived((current) => !current)}
              className={`rounded-md border px-2 py-1 text-[11px] ${isArchived ? "border-slate-400/40 text-slate-200" : "border-noema-borderSoft text-slate-300"}`}
            >
              {isArchived ? "Archived" : "Archive"}
            </button>
          </div>

          <div className="rounded-lg border border-noema-borderSoft bg-slate-950/55 p-2">
            <p className="text-[11px] font-medium text-slate-200">Linked assets</p>
            {linkedAttachments.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">No attachments linked yet.</p>
            ) : (
              <div className="mt-1 space-y-1 text-[11px] text-slate-300">
                {linkedAttachments.slice(0, 4).map((asset) => (
                  <p key={asset.id}>{asset.fileName} · {asset.type}</p>
                ))}
              </div>
            )}
            <p className="mt-1 text-[10px] text-slate-500">Embeds and file links will resolve against this attachment list in future export/OCR phases.</p>
            {matchedRefs.length > 0 && (
              <div className="mt-1 space-y-1 text-[10px] text-slate-400">
                {matchedRefs.slice(0, 3).map((ref, index) => (
                  <p key={`${ref.kind}-${index}`}>{ref.kind === "obsidian_embed" ? "Embed" : "Link"}: {ref.target} {ref.attachment ? "✓" : "(unmatched)"}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{isSaving ? "Saving…" : dirty ? "Unsaved changes" : `Saved ${formatSaved(lastSavedAt)}`}</span>
          <span className="text-slate-500">{bodyMarkdown.length} chars</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-2xl border border-noema-border bg-noema-glassStrong p-3">
        {mode === "edit" ? (
          <textarea
            value={bodyMarkdown}
            onChange={(event) => setBodyMarkdown(event.target.value)}
            placeholder="Write markdown here…"
            className="h-full min-h-72 w-full resize-none rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        ) : (
          <div className="h-full overflow-y-auto rounded-xl border border-noema-borderSoft bg-slate-950/60 p-3 text-sm">
            {bodyMarkdown.trim() ? <MarkdownRenderer content={bodyMarkdown} /> : <p className="text-slate-400">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
