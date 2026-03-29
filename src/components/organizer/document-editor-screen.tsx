"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import type { DocumentRecord } from "@/types/documents";

interface DocumentEditorScreenProps {
  document: DocumentRecord;
  onBack: () => void;
  onUpdate: (id: number, patch: { title?: string; bodyMarkdown?: string }) => Promise<void>;
}

type EditorMode = "edit" | "preview";

const formatSaved = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export function DocumentEditorScreen({ document, onBack, onUpdate }: DocumentEditorScreenProps) {
  const [mode, setMode] = useState<EditorMode>("edit");
  const [title, setTitle] = useState(document.title);
  const [bodyMarkdown, setBodyMarkdown] = useState(document.bodyMarkdown);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(document.updatedAt);

  useEffect(() => {
    setTitle(document.title);
    setBodyMarkdown(document.bodyMarkdown);
    setLastSavedAt(document.updatedAt);
  }, [document.bodyMarkdown, document.title, document.updatedAt, document.id]);

  const dirty = useMemo(() => title !== document.title || bodyMarkdown !== document.bodyMarkdown, [title, bodyMarkdown, document.title, document.bodyMarkdown]);

  useEffect(() => {
    if (!dirty || document.id === undefined) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        setIsSaving(true);
        try {
          await onUpdate(document.id as number, { title, bodyMarkdown });
          setLastSavedAt(new Date().toISOString());
        } finally {
          setIsSaving(false);
        }
      })();
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [dirty, document.id, onUpdate, title, bodyMarkdown]);

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

        <div className="mt-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Document title"
            className="w-full rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="mt-2 text-[11px] text-slate-400">
          {isSaving ? "Saving…" : dirty ? "Unsaved changes" : `Saved ${formatSaved(lastSavedAt)}`}
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
