"use client";

import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";

interface DocumentIntelligenceReviewSheetProps {
  visible: boolean;
  title: string;
  drafts: OrganizerDraftEnvelope[];
  busy?: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onAccept: () => Promise<void>;
}

export function DocumentIntelligenceReviewSheet({
  visible,
  title,
  drafts,
  busy = false,
  onClose,
  onDiscard,
  onAccept,
}: DocumentIntelligenceReviewSheetProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <section
        className="w-full max-h-[82vh] overflow-y-auto rounded-t-3xl border border-noema-border bg-[#10172d]/98 px-4 pb-6 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-500/80" />
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mb-3 text-xs text-slate-400">Review first. Nothing is saved until you accept.</p>

        <div className="space-y-2">
          {drafts.map((draft, index) => (
            <article key={`${draft.id}-${index}`} className="rounded-xl border border-noema-borderSoft bg-slate-900/75 p-3 text-xs text-slate-200">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">{draft.draftType.replace(/_/g, " ")}</p>

              {draft.draftType === "task_draft" && "draft" in draft.payload && (
                <div className="space-y-1">
                  <p className="font-medium text-slate-100">{(draft.payload.draft as import("@/types/tasks").CreateTaskInput).title}</p>
                  <p className="line-clamp-3 text-slate-300">
                    {(draft.payload.draft as import("@/types/tasks").CreateTaskInput).descriptionMarkdown}
                  </p>
                </div>
              )}

              {draft.draftType === "event_draft" && "draft" in draft.payload && (
                <div className="space-y-1">
                  <p className="font-medium text-slate-100">{(draft.payload.draft as import("@/types/calendar").CreateCalendarEventInput).title}</p>
                  <p className="text-slate-300">
                    {new Date((draft.payload.draft as import("@/types/calendar").CreateCalendarEventInput).startAt).toLocaleString()}
                  </p>
                </div>
              )}

              {draft.draftType === "document_draft" && "draft" in draft.payload && (
                <div className="space-y-1">
                  <p className="font-medium text-slate-100">Suggested title: {draft.payload.draft.title}</p>
                </div>
              )}

              {draft.draftType === "metadata_suggestion_draft" && "suggestions" in draft.payload && (
                <div className="space-y-1">
                  {draft.payload.suggestions.tags?.length ? (
                    <p className="text-slate-300">Tags: {draft.payload.suggestions.tags.join(", ")}</p>
                  ) : null}
                  {draft.payload.suggestions.note ? <p className="text-slate-300">{draft.payload.suggestions.note}</p> : null}
                </div>
              )}

              {draft.draftType === "subtask_suggestion_draft" && "subtasks" in draft.payload && (
                <ul className="list-disc space-y-1 pl-4 text-slate-300">
                  {draft.payload.subtasks.slice(0, 6).map((subtask) => (
                    <li key={subtask.id}>{subtask.title}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200"
            onClick={onDiscard}
          >
            Discard
          </button>
          <button
            type="button"
            className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void onAccept()}
          >
            {busy ? "Saving..." : "Accept"}
          </button>
        </div>
      </section>
    </div>
  );
}
