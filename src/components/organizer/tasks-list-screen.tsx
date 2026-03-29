"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { useTaskStore } from "@/store/task-store";
import { buildGuidedIntakeDraft, type GuidedClarification, type GuidedIntakeDraft } from "@/lib/tasks/guided-intake";
import { TasksGuidedIntakeSheet } from "@/components/organizer/tasks-guided-intake-sheet";
import { VoiceCaptureButton } from "@/components/voice/voice-capture-button";
import type { TaskCaptureMethod, TaskIntakeMode, TaskPriority, TaskRecord, TaskStatus } from "@/types/tasks";

type TaskQuickFilter = "today" | "upcoming" | "all" | "done" | "archived";

const QUICK_FILTERS: { key: TaskQuickFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
  { key: "archived", label: "Archived" },
];

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "border-slate-500/30 text-slate-300",
  normal: "border-sky-400/30 text-sky-200",
  high: "border-amber-400/40 text-amber-200",
  urgent: "border-rose-400/45 text-rose-200",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  inbox: "border-slate-500/35 text-slate-300",
  todo: "border-indigo-400/35 text-indigo-200",
  doing: "border-cyan-400/35 text-cyan-200",
  done: "border-emerald-400/40 text-emerald-200",
  archived: "border-slate-500/35 text-slate-400",
};

const formatDueAt = (iso?: string) => {
  if (!iso) return "No due date";
  const date = new Date(iso);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (minutes?: number) => {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const sortTasks = (tasks: TaskRecord[]) =>
  [...tasks].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt));

const isToday = (iso?: string) => {
  if (!iso) return false;
  const now = new Date();
  const value = new Date(iso);
  return (
    now.getFullYear() === value.getFullYear() &&
    now.getMonth() === value.getMonth() &&
    now.getDate() === value.getDate()
  );
};

const isUpcoming = (iso?: string) => {
  if (!iso) return false;
  const now = new Date();
  const value = new Date(iso);
  return value > now && !isToday(iso);
};

const buildSubtaskProgress = (task: TaskRecord) => {
  const subtasks = task.subtasks ?? [];
  if (subtasks.length === 0) return null;
  const completed = subtasks.filter((subtask) => subtask.completed).length;
  return `${completed}/${subtasks.length} subtasks`;
};

export function TasksListScreen() {
  const {
    tasks,
    hydrated,
    hydrating,
    hydrateTasks,
    createTask,
    defaultIntakeMode,
    rememberLastUsedMode,
    setDefaultIntakeMode,
    setRememberLastUsedMode,
  } = useTaskStore();
  const [activeFilter, setActiveFilter] = useState<TaskQuickFilter>("today");
  const [notice, setNotice] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<TaskCaptureMethod>("type");
  const [selectedMode, setSelectedMode] = useState<TaskIntakeMode>("guided_form");
  const [intakeDraft, setIntakeDraft] = useState("");
  const [guidedDraft, setGuidedDraft] = useState<GuidedIntakeDraft | null>(null);
  const [guidedClarifications, setGuidedClarifications] = useState<GuidedClarification[]>([]);
  const [guidedLoading, setGuidedLoading] = useState(false);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateTasks();
    }
  }, [hydrateTasks, hydrated, hydrating]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (launcherOpen) {
      setSelectedMode(defaultIntakeMode);
    }
  }, [launcherOpen, defaultIntakeMode]);

  const filteredTasks = useMemo(() => {
    const sorted = sortTasks(tasks);
    if (activeFilter === "today") return sorted.filter((task) => task.status !== "archived" && task.status !== "done" && isToday(task.dueAt));
    if (activeFilter === "upcoming") return sorted.filter((task) => task.status !== "archived" && task.status !== "done" && isUpcoming(task.dueAt));
    if (activeFilter === "done") return sorted.filter((task) => task.status === "done");
    if (activeFilter === "archived") return sorted.filter((task) => task.status === "archived");
    return sorted.filter((task) => task.status !== "archived");
  }, [activeFilter, tasks]);

  const handleCreate = async () => {
    const taskNumber = tasks.length + 1;
    const trimmedDraft = intakeDraft.trim();
    const titleFromDraft = trimmedDraft.split("\n").find((line) => line.trim().length > 0)?.trim();
    const sourceType = captureMethod === "voice" ? "voice_capture" : selectedMode === "guided_form" ? "manual" : "ai_intake";

    await createTask({
      title: titleFromDraft || `Task ${taskNumber}`,
      descriptionMarkdown: trimmedDraft,
      status: "inbox",
      priority: "normal",
      sourceType,
      tags: ["task"],
      intakeTranscript: captureMethod === "voice" ? trimmedDraft : undefined,
      aiAssisted: selectedMode === "guided_form",
    });

    if (rememberLastUsedMode) {
      setDefaultIntakeMode(selectedMode);
    }
    setActiveFilter("all");
    setLauncherOpen(false);
    setCaptureMethod("type");
    setIntakeDraft("");
    setNotice(selectedMode === "guided_form" ? "Task captured in guided mode." : "Task captured in conversational mode.");
  };

  const beginGuidedFlow = async () => {
    const trimmedDraft = intakeDraft.trim();
    if (!trimmedDraft) {
      setNotice("Add a rough request first so Noema can structure the task.");
      return;
    }
    setGuidedLoading(true);
    try {
      const result = await buildGuidedIntakeDraft(trimmedDraft);
      setGuidedDraft(result.draft);
      setGuidedClarifications(result.clarifications);
      setLauncherOpen(false);
    } finally {
      setGuidedLoading(false);
    }
  };

  const openLauncher = () => {
    setSelectedMode(defaultIntakeMode);
    setCaptureMethod("type");
    setLauncherOpen(true);
  };

  return (
    <section className="relative flex h-full min-h-0 flex-col gap-3 pb-16">
      <div className="rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Tasks</h2>
            <p className="text-[11px] text-slate-400">Personal task queue with local-first status tracking</p>
          </div>
          <span className="rounded-full border border-noema-borderSoft px-2 py-0.5 text-[11px] text-slate-300">{tasks.length} total</span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${
                activeFilter === filter.key
                  ? "border-violet-300/35 bg-violet-500/20 text-violet-100"
                  : "border-noema-borderSoft text-slate-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="flex min-h-44 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-noema-borderSoft bg-noema-glassStrong p-4 text-center">
          <p className="text-sm font-medium text-slate-200">No tasks in {QUICK_FILTERS.find((filter) => filter.key === activeFilter)?.label}.</p>
          <p className="mt-1 text-xs text-slate-400">Use the + button to quickly create a task.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {filteredTasks.map((task) => {
            const subtaskProgress = buildSubtaskProgress(task);
            const duration = formatDuration(task.estimatedDurationMinutes);
            return (
              <article key={task.id} className="rounded-xl border border-noema-borderSoft bg-slate-950/55 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-sm font-medium text-slate-100">{task.title}</h3>
                  <div className="mt-0.5 flex items-center gap-1">
                    {task.isPinned && <Icon icon="solar:pin-bold" className="text-sm text-amber-300" />}
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_STYLES[task.status]}`}>
                      {task.status}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-300">{formatDueAt(task.dueAt)}</span>
                  {duration && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-300">{duration}</span>}
                  {subtaskProgress && (
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                      {subtaskProgress}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {notice && <div className="rounded-xl border border-noema-borderSoft bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{notice}</div>}

      <button
        type="button"
        aria-label="Create task"
        onClick={openLauncher}
        className="absolute bottom-0 right-1 inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/25 text-violet-100 shadow-glass"
      >
        <Icon icon="solar:add-circle-bold" className="text-2xl" />
      </button>

      {launcherOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45" onClick={() => setLauncherOpen(false)}>
          <div className="w-full rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6 shadow-glass" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">Task capture</p>
                <p className="text-xs text-slate-400">Choose input method and intake mode</p>
              </div>
              <button type="button" onClick={() => setLauncherOpen(false)} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
                Cancel
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCaptureMethod("type")}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${captureMethod === "type" ? "border-violet-300/35 bg-violet-500/20 text-violet-100" : "border-noema-borderSoft text-slate-300"}`}
              >
                <span className="block text-[11px] uppercase text-slate-400">Input</span>
                Type task
              </button>
              <button
                type="button"
                onClick={() => setCaptureMethod("voice")}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${captureMethod === "voice" ? "border-violet-300/35 bg-violet-500/20 text-violet-100" : "border-noema-borderSoft text-slate-300"}`}
              >
                <span className="block text-[11px] uppercase text-slate-400">Input</span>
                Speak task
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-noema-borderSoft bg-slate-950/70 p-2">
              <p className="mb-2 text-[11px] font-medium text-slate-200">Intake mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMode("guided_form")}
                  className={`rounded-lg border px-2 py-2 text-left text-xs ${selectedMode === "guided_form" ? "border-violet-300/35 bg-violet-500/20 text-violet-100" : "border-noema-borderSoft text-slate-300"}`}
                >
                  Guided form
                  <span className="mt-1 block text-[11px] text-slate-400">Structured fields + AI-ready suggestions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode("conversational")}
                  className={`rounded-lg border px-2 py-2 text-left text-xs ${selectedMode === "conversational" ? "border-violet-300/35 bg-violet-500/20 text-violet-100" : "border-noema-borderSoft text-slate-300"}`}
                >
                  Conversational
                  <span className="mt-1 block text-[11px] text-slate-400">Mini prompt-like intake flow</span>
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-300">
                <button type="button" onClick={() => setDefaultIntakeMode(selectedMode)} className="rounded-md border border-noema-borderSoft px-2 py-1">
                  Set as default
                </button>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={rememberLastUsedMode}
                    onChange={(event) => setRememberLastUsedMode(event.target.checked)}
                  />
                  Remember last used mode
                </label>
              </div>
            </div>

            <textarea
              value={intakeDraft}
              onChange={(event) => setIntakeDraft(event.target.value)}
              placeholder={captureMethod === "voice" ? "Voice transcript appears here…" : "Type your rough task request…"}
              className="mb-3 h-24 w-full resize-none rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />

            {captureMethod === "voice" && (
              <div className="mb-3">
                <VoiceCaptureButton
                  compact
                  className="w-full justify-center"
                  onTranscript={(text) => {
                    setIntakeDraft((current) => `${current} ${text}`.trim());
                    setNotice("Voice transcript inserted.");
                  }}
                  onError={(error) => setNotice(error.message)}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setLauncherOpen(false);
                }}
                className="rounded-lg border border-noema-borderSoft px-3 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={guidedLoading}
                onClick={() => {
                  if (selectedMode === "guided_form") {
                    void beginGuidedFlow();
                  } else {
                    void handleCreate();
                  }
                }}
                className="rounded-lg border border-violet-300/35 bg-violet-500/20 px-3 py-2 text-xs font-medium text-violet-100 disabled:opacity-50"
              >
                {selectedMode === "guided_form" ? (guidedLoading ? "Structuring..." : "Continue to guided draft") : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {guidedDraft && (
        <TasksGuidedIntakeSheet
          draft={guidedDraft}
          clarifications={guidedClarifications}
          onCancel={() => {
            setGuidedDraft(null);
            setGuidedClarifications([]);
          }}
          onSave={async (draft) => {
            await createTask({
              title: draft.title.trim() || "Untitled task",
              descriptionMarkdown: draft.descriptionMarkdown,
              dueAt: draft.dueAt,
              estimatedDurationMinutes: draft.estimatedDurationMinutes,
              priority: draft.priority,
              status: draft.status,
              subtasks: draft.includeSubtasks
                ? draft.suggestedSubtasks
                    .map((subtask, index) => ({ ...subtask, order: index, title: subtask.title.trim() }))
                    .filter((subtask) => subtask.title.length > 0)
                : undefined,
              sourceType: "ai_intake",
              aiAssisted: true,
              tags: ["task"],
            });
            if (rememberLastUsedMode) {
              setDefaultIntakeMode("guided_form");
            }
            setGuidedDraft(null);
            setGuidedClarifications([]);
            setIntakeDraft("");
            setActiveFilter("all");
            setNotice("Guided task draft saved.");
          }}
        />
      )}
    </section>
  );
}
