"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";
import type { CreateTaskInput, TaskPriority, TaskSubtask } from "@/types/tasks";

interface TaskIntelligenceReviewSheetProps {
  visible: boolean;
  drafts: OrganizerDraftEnvelope[];
  busy?: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onAccept: (drafts: OrganizerDraftEnvelope[]) => Promise<void>;
}

const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function TaskIntelligenceReviewSheet({
  visible,
  drafts,
  busy = false,
  onClose,
  onDiscard,
  onAccept,
}: TaskIntelligenceReviewSheetProps) {
  const [enabled, setEnabled] = useState<boolean[]>([]);
  const [taskDraftEdits, setTaskDraftEdits] = useState<Record<string, CreateTaskInput>>({});
  const [subtaskEdits, setSubtaskEdits] = useState<Record<string, TaskSubtask[]>>({});

  useEffect(() => {
    if (!visible) return;
    setEnabled(drafts.map(() => true));

    const nextTaskEdits: Record<string, CreateTaskInput> = {};
    const nextSubtaskEdits: Record<string, TaskSubtask[]> = {};

    for (const draft of drafts) {
      if (draft.draftType === "task_draft" && "draft" in draft.payload) {
        nextTaskEdits[draft.id] = draft.payload.draft as CreateTaskInput;
      }
      if (draft.draftType === "subtask_suggestion_draft" && "subtasks" in draft.payload) {
        nextSubtaskEdits[draft.id] = draft.payload.subtasks;
      }
    }

    setTaskDraftEdits(nextTaskEdits);
    setSubtaskEdits(nextSubtaskEdits);
  }, [drafts, visible]);

  const effectiveDrafts = useMemo(
    () =>
      drafts
        .map((draft, index) => ({ draft, index }))
        .filter(({ index }) => enabled[index])
        .map(({ draft }) => {
          if (draft.draftType === "task_draft" && "draft" in draft.payload && taskDraftEdits[draft.id]) {
            return {
              ...draft,
              payload: {
                draft: taskDraftEdits[draft.id],
              },
            } as OrganizerDraftEnvelope;
          }

          if (draft.draftType === "subtask_suggestion_draft" && "subtasks" in draft.payload && subtaskEdits[draft.id]) {
            return {
              ...draft,
              payload: {
                subtasks: subtaskEdits[draft.id],
              },
            } as OrganizerDraftEnvelope;
          }

          return draft;
        }),
    [drafts, enabled, taskDraftEdits, subtaskEdits],
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <section
        className="w-full max-h-[84vh] overflow-y-auto rounded-t-3xl border border-noema-border bg-[#10172d]/98 px-4 pb-6 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-500/80" />
        <h3 className="text-sm font-semibold text-slate-100">Task intelligence review</h3>
        <p className="mb-3 text-xs text-slate-400">Choose proposals to apply. You can edit before accepting.</p>

        <div className="space-y-2">
          {drafts.map((draft, index) => (
            <article key={draft.id} className="rounded-xl border border-noema-borderSoft bg-slate-900/75 p-3 text-xs text-slate-200">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{draft.draftType.replace(/_/g, " ")}</p>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={enabled[index] ?? true}
                    onChange={(event) => setEnabled((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.checked : item)))}
                  />
                  apply
                </label>
              </div>

              {draft.draftType === "task_draft" && "draft" in draft.payload && taskDraftEdits[draft.id] && (
                <div className="space-y-2">
                  <input
                    value={taskDraftEdits[draft.id].title}
                    onChange={(event) =>
                      setTaskDraftEdits((current) => ({
                        ...current,
                        [draft.id]: {
                          ...current[draft.id],
                          title: event.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                  />
                  <textarea
                    rows={3}
                    value={taskDraftEdits[draft.id].descriptionMarkdown ?? ""}
                    onChange={(event) =>
                      setTaskDraftEdits((current) => ({
                        ...current,
                        [draft.id]: {
                          ...current[draft.id],
                          descriptionMarkdown: event.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={taskDraftEdits[draft.id].priority ?? "normal"}
                      onChange={(event) =>
                        setTaskDraftEdits((current) => ({
                          ...current,
                          [draft.id]: {
                            ...current[draft.id],
                            priority: event.target.value as TaskPriority,
                          },
                        }))
                      }
                      className="rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                    >
                      {priorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={taskDraftEdits[draft.id].dueAt ? new Date(taskDraftEdits[draft.id].dueAt as string).toISOString().slice(0, 16) : ""}
                      onChange={(event) =>
                        setTaskDraftEdits((current) => ({
                          ...current,
                          [draft.id]: {
                            ...current[draft.id],
                            dueAt: event.target.value ? new Date(event.target.value).toISOString() : undefined,
                          },
                        }))
                      }
                      className="rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </div>
              )}

              {draft.draftType === "subtask_suggestion_draft" && "subtasks" in draft.payload && subtaskEdits[draft.id] && (
                <div className="space-y-1">
                  {subtaskEdits[draft.id].map((subtask, subtaskIndex) => (
                    <input
                      key={`${subtask.id}-${subtaskIndex}`}
                      value={subtask.title}
                      onChange={(event) =>
                        setSubtaskEdits((current) => ({
                          ...current,
                          [draft.id]: current[draft.id].map((item, itemIndex) =>
                            itemIndex === subtaskIndex ? { ...item, title: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1 text-xs text-slate-100"
                    />
                  ))}
                </div>
              )}

              {draft.draftType === "metadata_suggestion_draft" && "suggestions" in draft.payload && (
                <p className="text-xs text-slate-300">{draft.payload.suggestions.note ?? `Priority: ${draft.payload.suggestions.priority ?? "n/a"}`}</p>
              )}
            </article>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            disabled={busy || effectiveDrafts.length === 0}
            className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void onAccept(effectiveDrafts)}
          >
            {busy ? "Applying..." : "Accept selected"}
          </button>
        </div>
      </section>
    </div>
  );
}
