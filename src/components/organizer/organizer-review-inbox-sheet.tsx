"use client";

import { useMemo, useState } from "react";
import { useDocumentStore } from "@/store/document-store";
import { useTaskStore } from "@/store/task-store";
import { useCalendarStore } from "@/store/calendar-store";
import { useOrganizerReviewQueueStore } from "@/store/organizer-review-queue-store";
import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";
import type { OrganizerReviewItemRecord } from "@/types/organizer-review";

interface OrganizerReviewInboxSheetProps {
  visible: boolean;
  onClose: () => void;
}

const toLocalDateTimeInput = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const sourceLabel: Record<OrganizerReviewItemRecord["source"], string> = {
  chat_conversion: "Chat conversion",
  document_intelligence: "Document intelligence",
  task_intelligence: "Task intelligence",
  calendar_intelligence: "Calendar intelligence",
};

export function OrganizerReviewInboxSheet({ visible, onClose }: OrganizerReviewInboxSheetProps) {
  const { items, setStatus, updateDraft } = useOrganizerReviewQueueStore();
  const { createTask } = useTaskStore();
  const { createDocument } = useDocumentStore();
  const { createEvent } = useCalendarStore();
  const [busyId, setBusyId] = useState<number | null>(null);

  const pending = useMemo(() => items.filter((item) => item.status === "pending"), [items]);

  const accept = async (item: OrganizerReviewItemRecord) => {
    if (item.id === undefined) return;
    setBusyId(item.id);
    try {
      const draft = item.draft;
      if (draft.draftType === "task_draft" && "draft" in draft.payload) {
        await createTask(draft.payload.draft as import("@/types/tasks").CreateTaskInput);
      } else if (draft.draftType === "document_draft" && "draft" in draft.payload) {
        await createDocument(draft.payload.draft as import("@/types/documents").CreateDocumentInput);
      } else if (draft.draftType === "event_draft" && "draft" in draft.payload) {
        await createEvent(draft.payload.draft as import("@/types/calendar").CreateCalendarEventInput);
      }
      await setStatus(item.id, "accepted");
    } finally {
      setBusyId(null);
    }
  };

  const discard = async (item: OrganizerReviewItemRecord) => {
    if (item.id === undefined) return;
    await setStatus(item.id, "discarded");
  };

  const editDraft = async (item: OrganizerReviewItemRecord, nextDraft: OrganizerDraftEnvelope) => {
    if (item.id === undefined) return;
    await updateDraft(item.id, nextDraft);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <section className="w-full max-h-[88vh] overflow-y-auto rounded-t-3xl border border-noema-border bg-[#10172d]/98 px-4 pb-6 pt-3" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-500/80" />
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Organizer Review Queue</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-noema-borderSoft px-2 py-1 text-xs text-slate-300">Close</button>
        </div>
        <p className="mb-3 text-xs text-slate-400">Pending proposals need explicit review before any write.</p>

        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-noema-borderSoft bg-slate-950/45 p-3 text-xs text-slate-400">No pending proposals.</div>
        ) : (
          <div className="space-y-2">
            {pending.map((item) => {
              const draft = item.draft;
              return (
                <article key={item.queueKey} className="rounded-xl border border-noema-borderSoft bg-slate-900/75 p-3 text-xs text-slate-200">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">{draft.draftType.replace(/_/g, " ")}</p>
                    <p className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="text-[11px] text-slate-400">{sourceLabel[item.source]} · {item.sourceLabel}{item.selectedAgentId ? ` · agent #${item.selectedAgentId}` : ""}</p>
                  <p className="mt-1 text-xs text-slate-300">{item.preview}</p>

                  {draft.draftType === "task_draft" && "draft" in draft.payload && (() => {
                    const taskDraft = draft.payload.draft as import("@/types/tasks").CreateTaskInput;
                    return (
                      <input
                        value={taskDraft.title}
                        onChange={(event) =>
                          void editDraft(item, {
                            ...draft,
                            payload: { draft: { ...taskDraft, title: event.target.value } },
                          } as OrganizerDraftEnvelope)
                        }
                        className="mt-2 w-full rounded-md border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                      />
                    );
                  })()}

                  {draft.draftType === "event_draft" && "draft" in draft.payload && (() => {
                    const eventDraft = draft.payload.draft as import("@/types/calendar").CreateCalendarEventInput;
                    return (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="datetime-local"
                          value={toLocalDateTimeInput(eventDraft.startAt)}
                          onChange={(event) =>
                            void editDraft(item, {
                              ...draft,
                              payload: {
                                draft: {
                                  ...eventDraft,
                                  startAt: event.target.value ? new Date(event.target.value).toISOString() : eventDraft.startAt,
                                },
                              },
                            } as OrganizerDraftEnvelope)
                          }
                          className="rounded-md border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                        />
                        <input
                          type="datetime-local"
                          value={toLocalDateTimeInput(eventDraft.endAt)}
                          onChange={(event) =>
                            void editDraft(item, {
                              ...draft,
                              payload: {
                                draft: {
                                  ...eventDraft,
                                  endAt: event.target.value ? new Date(event.target.value).toISOString() : eventDraft.endAt,
                                },
                              },
                            } as OrganizerDraftEnvelope)
                          }
                          className="rounded-md border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                        />
                      </div>
                    );
                  })()}

                  {draft.draftType === "document_draft" && "draft" in draft.payload && (() => {
                    const documentDraft = draft.payload.draft as import("@/types/documents").CreateDocumentInput;
                    return (
                      <input
                        value={documentDraft.title}
                        onChange={(event) =>
                          void editDraft(item, {
                            ...draft,
                            payload: { draft: { ...documentDraft, title: event.target.value } },
                          } as OrganizerDraftEnvelope)
                        }
                        className="mt-2 w-full rounded-md border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                      />
                    );
                  })()}

                  {draft.draftType === "metadata_suggestion_draft" && "suggestions" in draft.payload && (() => {
                    const suggestions = draft.payload.suggestions;
                    return (
                      <textarea
                        value={suggestions.note ?? ""}
                        onChange={(event) =>
                          void editDraft(item, {
                            ...draft,
                            payload: { suggestions: { ...suggestions, note: event.target.value } },
                          } as OrganizerDraftEnvelope)
                        }
                        className="mt-2 h-16 w-full rounded-md border border-noema-borderSoft bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                      />
                    );
                  })()}

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" disabled={busyId === item.id} onClick={() => void accept(item)} className="rounded-md border border-emerald-300/35 px-2 py-1.5 text-emerald-200 disabled:opacity-60">Accept</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void discard(item)} className="rounded-md border border-rose-300/35 px-2 py-1.5 text-rose-200 disabled:opacity-60">Discard</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
