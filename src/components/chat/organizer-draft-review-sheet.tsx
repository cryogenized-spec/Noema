"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";
import type { CreateCalendarEventInput } from "@/types/calendar";
import type { CreateDocumentInput } from "@/types/documents";
import type { CreateTaskInput, TaskPriority } from "@/types/tasks";

interface OrganizerDraftReviewSheetProps {
  draft: OrganizerDraftEnvelope | null;
  busy?: boolean;
  onClose: () => void;
  onAccept: (draft: OrganizerDraftEnvelope) => Promise<void>;
  onDiscard: (draft: OrganizerDraftEnvelope) => void;
}

const priorityOptions: TaskPriority[] = ["low", "normal", "high", "urgent"];

const toLocalInput = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toIso = (value: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export function OrganizerDraftReviewSheet({
  draft,
  busy = false,
  onClose,
  onAccept,
  onDiscard,
}: OrganizerDraftReviewSheetProps) {
  const [taskDraft, setTaskDraft] = useState<CreateTaskInput | null>(null);
  const [documentDraft, setDocumentDraft] = useState<CreateDocumentInput | null>(null);
  const [eventDraft, setEventDraft] = useState<CreateCalendarEventInput | null>(null);

  useEffect(() => {
    if (!draft) return;

    if (draft.draftType === "task_draft" && "draft" in draft.payload) {
      setTaskDraft(draft.payload.draft as CreateTaskInput);
      setDocumentDraft(null);
      setEventDraft(null);
      return;
    }

    if (draft.draftType === "document_draft" && "draft" in draft.payload) {
      setDocumentDraft(draft.payload.draft as CreateDocumentInput);
      setTaskDraft(null);
      setEventDraft(null);
      return;
    }

    if (draft.draftType === "event_draft" && "draft" in draft.payload) {
      setEventDraft(draft.payload.draft as CreateCalendarEventInput);
      setTaskDraft(null);
      setDocumentDraft(null);
      return;
    }
  }, [draft]);

  const workingDraft = useMemo(() => {
    if (!draft) return null;

    if (draft.draftType === "task_draft" && taskDraft) {
      return {
        ...draft,
        payload: {
          draft: {
            ...taskDraft,
            title: taskDraft.title?.trim() || "Task from chat",
          },
        },
      } as OrganizerDraftEnvelope;
    }

    if (draft.draftType === "document_draft" && documentDraft) {
      return {
        ...draft,
        payload: {
          draft: {
            ...documentDraft,
            title: documentDraft.title?.trim() || "Chat note",
            bodyMarkdown: documentDraft.bodyMarkdown ?? "",
          },
        },
      } as OrganizerDraftEnvelope;
    }

    if (draft.draftType === "event_draft" && eventDraft) {
      return {
        ...draft,
        payload: {
          draft: {
            ...eventDraft,
            title: eventDraft.title?.trim() || "Event from chat",
            descriptionMarkdown: eventDraft.descriptionMarkdown ?? "",
          },
        },
      } as OrganizerDraftEnvelope;
    }

    return draft;
  }, [documentDraft, draft, eventDraft, taskDraft]);

  if (!draft || !workingDraft) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss draft review"
        className="fixed inset-0 z-40 bg-black/55"
        onClick={onClose}
      />
      <section className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-3xl border border-noema-border bg-[#10172d]/98 px-4 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-500/80" />
        <header className="mb-3">
          <p className="text-sm font-semibold text-slate-100">Review organizer draft</p>
          <p className="text-xs text-slate-400">Edit before save. Nothing is written until you confirm.</p>
        </header>

        {draft.draftType === "task_draft" && taskDraft && (
          <div className="space-y-3">
            <input
              value={taskDraft.title}
              onChange={(event) => setTaskDraft((current) => (current ? { ...current, title: event.target.value } : current))}
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="Task title"
            />
            <textarea
              value={taskDraft.descriptionMarkdown ?? ""}
              onChange={(event) =>
                setTaskDraft((current) => (current ? { ...current, descriptionMarkdown: event.target.value } : current))
              }
              rows={5}
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="Task details"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={toLocalInput(taskDraft.dueAt)}
                onChange={(event) =>
                  setTaskDraft((current) => (current ? { ...current, dueAt: toIso(event.target.value) } : current))
                }
                className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              />
              <select
                value={taskDraft.priority ?? "normal"}
                onChange={(event) =>
                  setTaskDraft((current) =>
                    current ? { ...current, priority: event.target.value as TaskPriority } : current,
                  )
                }
                className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              >
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {draft.draftType === "document_draft" && documentDraft && (
          <div className="space-y-3">
            <input
              value={documentDraft.title}
              onChange={(event) =>
                setDocumentDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="Document title"
            />
            <input
              value={(documentDraft.tags ?? []).join(", ")}
              onChange={(event) =>
                setDocumentDraft((current) =>
                  current
                    ? {
                        ...current,
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      }
                    : current,
                )
              }
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="tags, optional"
            />
            <textarea
              value={documentDraft.bodyMarkdown}
              onChange={(event) =>
                setDocumentDraft((current) => (current ? { ...current, bodyMarkdown: event.target.value } : current))
              }
              rows={8}
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="Document body"
            />
          </div>
        )}

        {draft.draftType === "event_draft" && eventDraft && (
          <div className="space-y-3">
            <input
              value={eventDraft.title}
              onChange={(event) => setEventDraft((current) => (current ? { ...current, title: event.target.value } : current))}
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="Event title"
            />
            <textarea
              value={eventDraft.descriptionMarkdown ?? ""}
              onChange={(event) =>
                setEventDraft((current) => (current ? { ...current, descriptionMarkdown: event.target.value } : current))
              }
              rows={5}
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="Event details"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={toLocalInput(eventDraft.startAt)}
                onChange={(event) =>
                  setEventDraft((current) => (current ? { ...current, startAt: toIso(event.target.value) ?? current.startAt } : current))
                }
                className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              />
              <input
                type="datetime-local"
                value={toLocalInput(eventDraft.endAt)}
                onChange={(event) =>
                  setEventDraft((current) => (current ? { ...current, endAt: toIso(event.target.value) ?? current.endAt } : current))
                }
                className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={Boolean(eventDraft.allDay)}
                onChange={(event) =>
                  setEventDraft((current) => (current ? { ...current, allDay: event.target.checked } : current))
                }
              />
              All-day event
            </label>
            <input
              value={eventDraft.reminderAt ? toLocalInput(eventDraft.reminderAt) : ""}
              onChange={(event) =>
                setEventDraft((current) =>
                  current ? { ...current, reminderAt: toIso(event.target.value), reminderEnabled: Boolean(event.target.value) } : current,
                )
              }
              type="datetime-local"
              className="w-full rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200"
            onClick={() => {
              onDiscard(workingDraft);
              onClose();
            }}
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
            onClick={() => void onAccept(workingDraft)}
          >
            {busy ? "Saving..." : "Accept"}
          </button>
        </div>
      </section>
    </>
  );
}
