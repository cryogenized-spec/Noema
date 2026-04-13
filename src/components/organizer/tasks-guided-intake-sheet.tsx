"use client";

import { useMemo, useState } from "react";
import type { GuidedClarification, GuidedIntakeDraft } from "@/lib/tasks/guided-intake";
import type { TaskPriority, TaskStatus, TaskSubtask } from "@/types/tasks";

interface TasksGuidedIntakeSheetProps {
  draft: GuidedIntakeDraft;
  clarifications: GuidedClarification[];
  onCancel: () => void;
  onSave: (draft: GuidedIntakeDraft & { includeSubtasks: boolean }) => Promise<void>;
}

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "normal", "high", "urgent"];
const STATUS_OPTIONS: TaskStatus[] = ["inbox", "todo", "doing", "done", "archived"];

export function TasksGuidedIntakeSheet({ draft, clarifications, onCancel, onSave }: TasksGuidedIntakeSheetProps) {
  const [workingDraft, setWorkingDraft] = useState<GuidedIntakeDraft>(draft);
  const [includeSubtasks, setIncludeSubtasks] = useState(draft.suggestedSubtasks.length > 0);
  const [saving, setSaving] = useState(false);

  const clarificationIds = useMemo(() => new Set(clarifications.map((item) => item.id)), [clarifications]);

  const updateSubtask = (index: number, nextTitle: string) => {
    setWorkingDraft((current) => ({
      ...current,
      suggestedSubtasks: current.suggestedSubtasks.map((subtask, subtaskIndex) =>
        subtaskIndex === index ? { ...subtask, title: nextTitle } : subtask,
      ),
    }));
  };

  const addSubtask = () => {
    setWorkingDraft((current) => ({
      ...current,
      suggestedSubtasks: [
        ...current.suggestedSubtasks,
        {
          id: crypto.randomUUID(),
          title: "",
          completed: false,
          order: current.suggestedSubtasks.length,
        } satisfies TaskSubtask,
      ],
    }));
    setIncludeSubtasks(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onCancel}>
      <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6 shadow-glass" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-100">Guided task draft</p>
            <p className="text-xs text-slate-400">Review suggestions, answer only needed clarifications, then save.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
            Discard
          </button>
        </div>

        {clarifications.length > 0 && (
          <div className="mb-3 rounded-xl border border-noema-borderSoft bg-slate-950/70 p-2">
            <p className="text-[11px] font-medium text-slate-200">Clarifications</p>
            <div className="mt-1 space-y-1.5">
              {clarifications.map((clarification) => (
                <div key={clarification.id} className="rounded-lg border border-noema-borderSoft bg-slate-900/60 p-2">
                  <p className="text-xs text-slate-100">{clarification.question}</p>
                  {clarification.helpText && <p className="mt-0.5 text-[11px] text-slate-400">{clarification.helpText}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <input
            value={workingDraft.title}
            onChange={(event) => setWorkingDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Task title"
            className="w-full rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <textarea
            value={workingDraft.descriptionMarkdown}
            onChange={(event) => setWorkingDraft((current) => ({ ...current, descriptionMarkdown: event.target.value }))}
            placeholder="Description"
            className="h-24 w-full resize-none rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={workingDraft.dueAt ? new Date(workingDraft.dueAt).toISOString().slice(0, 16) : ""}
              onChange={(event) =>
                setWorkingDraft((current) => ({
                  ...current,
                  dueAt: event.target.value ? new Date(event.target.value).toISOString() : undefined,
                }))
              }
              className={`w-full rounded-lg border bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none ${clarificationIds.has("due_time") ? "border-cyan-300/35" : "border-noema-borderSoft"}`}
            />
            <input
              type="number"
              min={0}
              step={5}
              value={workingDraft.estimatedDurationMinutes ?? ""}
              onChange={(event) =>
                setWorkingDraft((current) => ({
                  ...current,
                  estimatedDurationMinutes: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
              placeholder="Duration (min)"
              className={`w-full rounded-lg border bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none ${clarificationIds.has("duration") ? "border-cyan-300/35" : "border-noema-borderSoft"}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={workingDraft.priority}
              onChange={(event) => setWorkingDraft((current) => ({ ...current, priority: event.target.value as TaskPriority }))}
              className={`w-full rounded-lg border bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none ${clarificationIds.has("priority") ? "border-cyan-300/35" : "border-noema-borderSoft"}`}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={workingDraft.status}
              onChange={(event) => setWorkingDraft((current) => ({ ...current, status: event.target.value as TaskStatus }))}
              className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-noema-borderSoft bg-slate-950/70 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-200">Subtasks</p>
              <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                <input type="checkbox" checked={includeSubtasks} onChange={(event) => setIncludeSubtasks(event.target.checked)} />
                Include suggested subtasks
              </label>
            </div>
            {includeSubtasks && (
              <div className="mt-2 space-y-1.5">
                {workingDraft.suggestedSubtasks.map((subtask, index) => (
                  <input
                    key={subtask.id}
                    value={subtask.title}
                    onChange={(event) => updateSubtask(index, event.target.value)}
                    placeholder={`Subtask ${index + 1}`}
                    className="w-full rounded-lg border border-noema-borderSoft bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                ))}
                <button type="button" onClick={addSubtask} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
                  Add subtask
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-noema-borderSoft px-3 py-2 text-xs text-slate-300">
            Discard
          </button>
          <button
            type="button"
            disabled={saving || !workingDraft.title.trim()}
            onClick={() => {
              setSaving(true);
              void onSave({ ...workingDraft, includeSubtasks }).finally(() => setSaving(false));
            }}
            className="rounded-lg border border-violet-300/35 bg-violet-500/20 px-3 py-2 text-xs font-medium text-violet-100 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm & save"}
          </button>
        </div>
      </div>
    </div>
  );
}

