"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { deriveReminderState } from "@/lib/tasks/reminders";
import type { CreateTaskInput, TaskRecord } from "@/types/tasks";

interface TaskEditorScreenProps {
  task: TaskRecord;
  onBack: () => void;
  onUpdate: (id: number, patch: Partial<CreateTaskInput>) => Promise<void>;
}

type EditorMode = "edit" | "preview";

const normalizeTags = (tags: string[]) => Array.from(new Set(tags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean)));

const formatSaved = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const toDateTimeLocalValue = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

export function TaskEditorScreen({ task, onBack, onUpdate }: TaskEditorScreenProps) {
  const [mode, setMode] = useState<EditorMode>("edit");
  const [title, setTitle] = useState(task.title);
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(task.descriptionMarkdown);
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(task.dueAt ?? "");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(task.estimatedDurationMinutes ?? 0);
  const [tags, setTags] = useState(task.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [isPinned, setIsPinned] = useState(task.isPinned);
  const [reminderEnabled, setReminderEnabled] = useState(task.reminderEnabled);
  const [reminderAt, setReminderAt] = useState(task.reminderAt ?? "");
  const [reminderNote, setReminderNote] = useState(task.reminderNote ?? "");
  const [subtasks, setSubtasks] = useState(task.subtasks ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(task.updatedAt);

  useEffect(() => {
    setTitle(task.title);
    setDescriptionMarkdown(task.descriptionMarkdown);
    setStatus(task.status);
    setPriority(task.priority);
    setDueAt(task.dueAt ?? "");
    setEstimatedDurationMinutes(task.estimatedDurationMinutes ?? 0);
    setTags(task.tags);
    setTagDraft("");
    setIsPinned(task.isPinned);
    setReminderEnabled(task.reminderEnabled);
    setReminderAt(task.reminderAt ?? "");
    setReminderNote(task.reminderNote ?? "");
    setSubtasks(task.subtasks ?? []);
    setLastSavedAt(task.updatedAt);
    setMode("edit");
  }, [task]);

  const normalizedSubtasks = useMemo(
    () =>
      subtasks
        .map((subtask, index) => ({
          ...subtask,
          title: subtask.title.trim(),
          order: index,
        }))
        .filter((subtask) => subtask.title.length > 0),
    [subtasks],
  );

  const reminderStatus = useMemo(
    () =>
      deriveReminderState({
        reminderEnabled,
        reminderAt: reminderAt || undefined,
        reminderState: task.reminderState,
      }),
    [reminderAt, reminderEnabled, task.reminderState],
  );

  const dirty = useMemo(
    () =>
      title !== task.title ||
      descriptionMarkdown !== task.descriptionMarkdown ||
      status !== task.status ||
      priority !== task.priority ||
      dueAt !== (task.dueAt ?? "") ||
      estimatedDurationMinutes !== (task.estimatedDurationMinutes ?? 0) ||
      isPinned !== task.isPinned ||
      reminderEnabled !== task.reminderEnabled ||
      reminderAt !== (task.reminderAt ?? "") ||
      reminderStatus !== task.reminderState ||
      reminderNote !== (task.reminderNote ?? "") ||
      JSON.stringify(normalizeTags(tags)) !== JSON.stringify(normalizeTags(task.tags)) ||
      JSON.stringify(normalizedSubtasks) !== JSON.stringify(task.subtasks ?? []),
    [descriptionMarkdown, dueAt, estimatedDurationMinutes, isPinned, normalizedSubtasks, priority, reminderAt, reminderEnabled, reminderNote, reminderStatus, status, tags, task, title],
  );

  useEffect(() => {
    if (!dirty || task.id === undefined) return;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setIsSaving(true);
        try {
          await onUpdate(task.id as number, {
            title,
            descriptionMarkdown,
            status,
            priority,
            dueAt: dueAt || undefined,
            estimatedDurationMinutes: estimatedDurationMinutes > 0 ? estimatedDurationMinutes : undefined,
            isPinned,
            reminderEnabled,
            reminderAt: reminderEnabled && reminderAt ? reminderAt : undefined,
            reminderState: reminderStatus,
            reminderNote: reminderEnabled ? reminderNote.trim() || undefined : undefined,
            tags: normalizeTags(tags),
            subtasks: normalizedSubtasks,
          });
          setLastSavedAt(new Date().toISOString());
        } finally {
          setIsSaving(false);
        }
      })();
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [descriptionMarkdown, dirty, dueAt, estimatedDurationMinutes, isPinned, normalizedSubtasks, onUpdate, priority, reminderAt, reminderEnabled, reminderNote, reminderStatus, status, tags, task.id, title]);

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
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-300">
            <Icon icon="solar:alt-arrow-left-bold" className="text-sm" />
            Back
          </button>
          <div className="rounded-lg border border-noema-borderSoft bg-slate-950/70 p-1">
            <button type="button" onClick={() => setMode("edit")} className={`rounded-md px-2 py-1 text-xs ${mode === "edit" ? "bg-violet-500/20 text-violet-100" : "text-slate-400"}`}>Edit</button>
            <button type="button" onClick={() => setMode("preview")} className={`rounded-md px-2 py-1 text-xs ${mode === "preview" ? "bg-violet-500/20 text-violet-100" : "text-slate-400"}`}>Preview</button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" className="w-full rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none" />

          <div className="grid grid-cols-2 gap-2">
            <select value={status} onChange={(event) => setStatus(event.target.value as TaskRecord["status"])} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none">
              <option value="inbox">inbox</option>
              <option value="todo">todo</option>
              <option value="doing">doing</option>
              <option value="done">done</option>
              <option value="archived">archived</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskRecord["priority"])} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none">
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" value={toDateTimeLocalValue(dueAt)} onChange={(event) => setDueAt(event.target.value ? new Date(event.target.value).toISOString() : "")} className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none" />
            <input type="number" min={0} step={5} value={estimatedDurationMinutes || ""} onChange={(event) => setEstimatedDurationMinutes(event.target.value ? Number(event.target.value) : 0)} placeholder="Duration (min)" className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsPinned((current) => !current)} className={`rounded-md border px-2 py-1 text-[11px] ${isPinned ? "border-amber-300/40 text-amber-200" : "border-noema-borderSoft text-slate-300"}`}>{isPinned ? "Pinned" : "Pin"}</button>
            <button type="button" onClick={() => setStatus((current) => (current === "archived" ? "todo" : "archived"))} className={`rounded-md border px-2 py-1 text-[11px] ${status === "archived" ? "border-slate-400/40 text-slate-200" : "border-noema-borderSoft text-slate-300"}`}>{status === "archived" ? "Unarchive" : "Archive"}</button>
          </div>

          <div className="rounded-xl border border-noema-borderSoft bg-slate-950/55 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-200">Reminder</p>
              <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setReminderEnabled(checked);
                  }}
                />
                Enabled
              </label>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <input
                type="datetime-local"
                disabled={!reminderEnabled}
                value={toDateTimeLocalValue(reminderAt)}
                onChange={(event) => setReminderAt(event.target.value ? new Date(event.target.value).toISOString() : "")}
                className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 disabled:opacity-50 focus:outline-none"
              />
              <input
                value={reminderNote}
                disabled={!reminderEnabled}
                onChange={(event) => setReminderNote(event.target.value)}
                placeholder="Reminder note (optional)"
                className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 disabled:opacity-50 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400">
                Status: <span className="text-slate-300">{reminderStatus}</span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-noema-borderSoft bg-slate-950/55 p-2">
            <p className="text-xs font-medium text-slate-200">Subtasks</p>
            <div className="mt-2 space-y-1.5">
              {subtasks.map((subtask, index) => (
                <div key={subtask.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={subtask.completed} onChange={(event) => setSubtasks((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, completed: event.target.checked } : item)))} />
                  <input value={subtask.title} onChange={(event) => setSubtasks((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)))} placeholder={`Subtask ${index + 1}`} className="w-full rounded-lg border border-noema-borderSoft bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
                  <button type="button" onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-md border border-rose-300/30 px-1.5 py-1 text-[11px] text-rose-200">Del</button>
                </div>
              ))}
              <button type="button" onClick={() => setSubtasks((current) => [...current, { id: crypto.randomUUID(), title: "", completed: false, order: current.length }])} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
                Add subtask
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-1">
            <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder="Add tag" className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
            <button type="button" onClick={addTag} className="rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-300">Add</button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))} className="rounded-full border border-violet-300/25 bg-violet-500/12 px-2 py-0.5 text-[11px] text-violet-100">
                  #{tag} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{isSaving ? "Saving…" : dirty ? "Unsaved changes" : `Saved ${formatSaved(lastSavedAt)}`}</span>
          <span className="text-slate-500">{descriptionMarkdown.length} chars</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-2xl border border-noema-border bg-noema-glassStrong p-3">
        {mode === "edit" ? (
          <textarea value={descriptionMarkdown} onChange={(event) => setDescriptionMarkdown(event.target.value)} placeholder="Task description (markdown)" className="h-full min-h-72 w-full resize-none rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none" />
        ) : (
          <div className="h-full overflow-y-auto rounded-xl border border-noema-borderSoft bg-slate-950/60 p-3 text-sm">
            {descriptionMarkdown.trim() ? <MarkdownRenderer content={descriptionMarkdown} /> : <p className="text-slate-400">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
