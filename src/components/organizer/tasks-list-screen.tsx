"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useTaskStore } from "@/store/task-store";
import { buildGuidedIntakeDraft, type GuidedClarification, type GuidedIntakeDraft } from "@/lib/tasks/guided-intake";
import { TasksGuidedIntakeSheet } from "@/components/organizer/tasks-guided-intake-sheet";
import { TasksConversationalIntakeSheet } from "@/components/organizer/tasks-conversational-intake-sheet";
import { TaskEditorScreen } from "@/components/organizer/task-editor-screen";
import { VoiceCaptureButton } from "@/components/voice/voice-capture-button";
import { useCalendarStore } from "@/store/calendar-store";
import { projectTaskToCalendarEventInput } from "@/lib/calendar/task-bridge";
import type { TaskCaptureMethod, TaskIntakeMode, TaskPriority, TaskRecord, TaskStatus } from "@/types/tasks";

type TaskQuickFilter = "today" | "upcoming" | "all" | "done" | "archived";
type TaskViewMode = "list" | "board";

const QUICK_FILTERS: { key: TaskQuickFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
  { key: "archived", label: "Archived" },
];

const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "inbox", label: "Inbox" },
  { status: "todo", label: "Todo" },
  { status: "doing", label: "Doing" },
  { status: "done", label: "Done" },
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
    updateTask,
    deleteTask,
    defaultIntakeMode,
    rememberLastUsedMode,
    setDefaultIntakeMode,
    setRememberLastUsedMode,
  } = useTaskStore();
  const {
    events: calendarEvents,
    hydrated: calendarHydrated,
    hydrating: calendarHydrating,
    hydrateEvents: hydrateCalendarEvents,
    createEvent: createCalendarEvent,
    updateEvent: updateCalendarEvent,
  } = useCalendarStore();
  const [activeFilter, setActiveFilter] = useState<TaskQuickFilter>("today");
  const [activeView, setActiveView] = useState<TaskViewMode>("list");
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [openTaskIntelligenceOnMount, setOpenTaskIntelligenceOnMount] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [actionTask, setActionTask] = useState<TaskRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<TaskCaptureMethod>("type");
  const [selectedMode, setSelectedMode] = useState<TaskIntakeMode>("guided_form");
  const [intakeDraft, setIntakeDraft] = useState("");
  const [guidedDraft, setGuidedDraft] = useState<GuidedIntakeDraft | null>(null);
  const [guidedClarifications, setGuidedClarifications] = useState<GuidedClarification[]>([]);
  const [guidedLoading, setGuidedLoading] = useState(false);
  const [conversationalDraft, setConversationalDraft] = useState<GuidedIntakeDraft | null>(null);
  const [conversationalClarifications, setConversationalClarifications] = useState<GuidedClarification[]>([]);
  const longPressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateTasks();
    }
  }, [hydrateTasks, hydrated, hydrating]);

  useEffect(() => {
    if (!calendarHydrated && !calendarHydrating) {
      void hydrateCalendarEvents();
    }
  }, [calendarHydrated, calendarHydrating, hydrateCalendarEvents]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    },
    [],
  );

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

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [tasks, activeTaskId],
  );
  const selectedTasks = useMemo(
    () => tasks.filter((task) => task.id !== undefined && selectedTaskIds.includes(task.id)),
    [tasks, selectedTaskIds],
  );
  const boardColumns = useMemo(() => {
    if (activeFilter === "archived") return [{ status: "archived" as const, label: "Archived" }];
    if (activeFilter === "done") return BOARD_COLUMNS.filter((column) => column.status === "done");
    return BOARD_COLUMNS;
  }, [activeFilter]);
  const tasksByStatus = useMemo(
    () =>
      boardColumns.reduce<Record<string, TaskRecord[]>>((acc, column) => {
        acc[column.status] = filteredTasks.filter((task) => task.status === column.status);
        return acc;
      }, {}),
    [boardColumns, filteredTasks],
  );
  const linkedEventByTaskId = useMemo(() => {
    const map = new Map<number, number>();
    for (const event of calendarEvents) {
      if (event.linkedTaskId && event.status !== "archived") {
        map.set(event.linkedTaskId, (map.get(event.linkedTaskId) ?? 0) + 1);
      }
    }
    return map;
  }, [calendarEvents]);

  const saveStructuredDraft = async (draft: GuidedIntakeDraft, includeSubtasks: boolean) => {
    await createTask({
      title: draft.title.trim() || "Untitled task",
      descriptionMarkdown: draft.descriptionMarkdown,
      dueAt: draft.dueAt,
      estimatedDurationMinutes: draft.estimatedDurationMinutes,
      priority: draft.priority,
      status: draft.status,
      subtasks: includeSubtasks
        ? draft.suggestedSubtasks
            .map((subtask, index) => ({ ...subtask, order: index, title: subtask.title.trim() }))
            .filter((subtask) => subtask.title.length > 0)
        : undefined,
      sourceType: "ai_intake",
      aiAssisted: true,
      tags: ["task"],
    });
    if (rememberLastUsedMode) {
      setDefaultIntakeMode(selectedMode);
    }
    setGuidedDraft(null);
    setGuidedClarifications([]);
    setConversationalDraft(null);
    setConversationalClarifications([]);
    setIntakeDraft("");
    setActiveFilter("all");
    setNotice("Task draft saved.");
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

  const beginConversationalFlow = async () => {
    const trimmedDraft = intakeDraft.trim();
    if (!trimmedDraft) {
      setNotice("Add a rough request first so Noema can structure the task.");
      return;
    }
    setGuidedLoading(true);
    try {
      const result = await buildGuidedIntakeDraft(trimmedDraft);
      setConversationalDraft(result.draft);
      setConversationalClarifications(result.clarifications);
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

  const toggleSelectTask = (task: TaskRecord) => {
    if (task.id === undefined) return;
    setSelectedTaskIds((current) =>
      current.includes(task.id as number) ? current.filter((id) => id !== task.id) : [...current, task.id as number],
    );
  };

  const clearSelectionMode = () => {
    setSelectionMode(false);
    setSelectedTaskIds([]);
  };

  const startLongPress = (task: TaskRecord) => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      if (task.id !== undefined) {
        setSelectionMode(true);
        setSelectedTaskIds((current) => (current.includes(task.id as number) ? current : [...current, task.id as number]));
      }
      setActionTask(task);
    }, 420);
  };

  const stopLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (selectionMode && selectedTaskIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedTaskIds.length]);

  const duplicateTask = async (task: TaskRecord) => {
    await createTask({
      title: `${task.title} Copy`,
      descriptionMarkdown: task.descriptionMarkdown,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      estimatedDurationMinutes: task.estimatedDurationMinutes,
      tags: task.tags,
      isPinned: task.isPinned,
      sourceType: task.sourceType,
      sourceRef: task.sourceRef,
      intakeTranscript: task.intakeTranscript,
      aiAssisted: task.aiAssisted,
      aiClarificationSummary: task.aiClarificationSummary,
      subtasks: task.subtasks,
    });
    setActionTask(null);
    setNotice("Task duplicated.");
  };

  const scheduleTask = async (task: TaskRecord) => {
    if (task.id === undefined) return;
    const projection = projectTaskToCalendarEventInput(task);
    if (!projection) {
      setNotice("Add a due date first to schedule this task.");
      return;
    }

    const existingProjection = calendarEvents.find(
      (event) => event.linkedTaskId === task.id && event.sourceType === "task_projection" && event.status !== "archived",
    );

    if (existingProjection?.id !== undefined) {
      await updateCalendarEvent(existingProjection.id, projection);
      setNotice("Linked calendar event updated.");
      return;
    }

    await createCalendarEvent(projection);
    setNotice("Task scheduled on calendar.");
  };

  const bulkComplete = async () => {
    await Promise.all(
      selectedTasks.flatMap((task) => (task.id !== undefined ? [updateTask(task.id, { status: task.status === "done" ? "todo" : "done" })] : [])),
    );
    clearSelectionMode();
  };

  const bulkArchive = async () => {
    await Promise.all(
      selectedTasks.flatMap((task) =>
        task.id !== undefined ? [updateTask(task.id, { status: task.status === "archived" ? "todo" : "archived" })] : [],
      ),
    );
    clearSelectionMode();
  };

  const bulkDelete = async () => {
    await Promise.all(selectedTasks.flatMap((task) => (task.id !== undefined ? [deleteTask(task.id)] : [])));
    clearSelectionMode();
  };

  const bulkPin = async () => {
    await Promise.all(
      selectedTasks.flatMap((task) => (task.id !== undefined ? [updateTask(task.id, { isPinned: !task.isPinned })] : [])),
    );
    clearSelectionMode();
  };

  if (activeTask && activeTask.id !== undefined) {
    return (
      <TaskEditorScreen
        task={activeTask}
        openIntelligenceOnMount={openTaskIntelligenceOnMount}
        onBack={() => {
          setOpenTaskIntelligenceOnMount(false);
          setActiveTaskId(null);
        }}
        onUpdate={async (id, patch) => {
          await updateTask(id, patch);
        }}
      />
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col gap-3 pb-16">
      {selectionMode && (
        <div className="rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-100">{selectedTaskIds.length} selected</p>
            <button type="button" onClick={clearSelectionMode} className="text-xs text-slate-400">
              Close
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => void bulkComplete()} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
              Complete/Reopen
            </button>
            <button type="button" onClick={() => void bulkArchive()} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
              Archive
            </button>
            <button type="button" onClick={() => void bulkPin()} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
              Pin
            </button>
            <button type="button" onClick={() => void bulkDelete()} className="rounded-md border border-rose-300/30 px-2 py-1 text-[11px] text-rose-200">
              Delete
            </button>
          </div>
        </div>
      )}

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
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={`rounded-md border px-2 py-1 text-[11px] ${activeView === "list" ? "border-violet-300/35 bg-violet-500/20 text-violet-100" : "border-noema-borderSoft text-slate-300"}`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setActiveView("board")}
            className={`rounded-md border px-2 py-1 text-[11px] ${activeView === "board" ? "border-violet-300/35 bg-violet-500/20 text-violet-100" : "border-noema-borderSoft text-slate-300"}`}
          >
            Board
          </button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="flex min-h-44 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-noema-borderSoft bg-noema-glassStrong p-4 text-center">
          <p className="text-sm font-medium text-slate-200">No tasks in {QUICK_FILTERS.find((filter) => filter.key === activeFilter)?.label}.</p>
          <p className="mt-1 text-xs text-slate-400">Use the + button to quickly create a task.</p>
        </div>
      ) : activeView === "list" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {filteredTasks.map((task) => {
            const subtaskProgress = buildSubtaskProgress(task);
            const duration = formatDuration(task.estimatedDurationMinutes);
            const isSelected = task.id !== undefined && selectedTaskIds.includes(task.id);
            return (
              <article
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelectTask(task);
                    return;
                  }
                  setActiveTaskId(task.id ?? null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setActionTask(task);
                }}
                onTouchStart={() => startLongPress(task)}
                onTouchMove={stopLongPress}
                onTouchEnd={stopLongPress}
                onTouchCancel={stopLongPress}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (selectionMode) {
                      toggleSelectTask(task);
                    } else {
                      setActiveTaskId(task.id ?? null);
                    }
                  }
                }}
                className={`rounded-xl border p-3 ${isSelected ? "border-violet-300/35 bg-violet-500/10" : "border-noema-borderSoft bg-slate-950/55"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-sm font-medium text-slate-100">{task.title}</h3>
                  <div className="mt-0.5 flex items-center gap-1">
                    {isSelected && <Icon icon="solar:check-circle-bold" className="text-sm text-violet-200" />}
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
                  {(task.id !== undefined ? linkedEventByTaskId.get(task.id) : 0) ? (
                    <span className="rounded-full border border-indigo-300/35 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-200">
                      Scheduled
                    </span>
                  ) : null}
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
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          <div className="flex h-full min-h-0 gap-2">
            {boardColumns.map((column) => (
              <section key={column.status} className="flex h-full min-h-0 w-64 shrink-0 flex-col rounded-xl border border-noema-borderSoft bg-slate-950/50 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-200">{column.label}</p>
                  <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-400">
                    {tasksByStatus[column.status]?.length ?? 0}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                  {(tasksByStatus[column.status] ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-noema-borderSoft p-2 text-[11px] text-slate-500">No tasks</div>
                  ) : (
                    (tasksByStatus[column.status] ?? []).map((task) => {
                      const subtaskProgress = buildSubtaskProgress(task);
                      const duration = formatDuration(task.estimatedDurationMinutes);
                      const isSelected = task.id !== undefined && selectedTaskIds.includes(task.id);
                      return (
                        <article
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (selectionMode) {
                              toggleSelectTask(task);
                              return;
                            }
                            setActiveTaskId(task.id ?? null);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setActionTask(task);
                          }}
                          onTouchStart={() => startLongPress(task)}
                          onTouchMove={stopLongPress}
                          onTouchEnd={stopLongPress}
                          onTouchCancel={stopLongPress}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              if (selectionMode) {
                                toggleSelectTask(task);
                              } else {
                                setActiveTaskId(task.id ?? null);
                              }
                            }
                          }}
                          className={`rounded-xl border p-2.5 ${isSelected ? "border-violet-300/35 bg-violet-500/10" : "border-noema-borderSoft bg-slate-950/70"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="line-clamp-2 text-xs font-medium text-slate-100">{task.title}</h3>
                            <div className="mt-0.5 flex items-center gap-1">
                              {isSelected && <Icon icon="solar:check-circle-bold" className="text-sm text-violet-200" />}
                              {task.isPinned && <Icon icon="solar:pin-bold" className="text-sm text-amber-300" />}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                              {task.priority}
                            </span>
                            <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-300">{formatDueAt(task.dueAt)}</span>
                            {duration && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-300">{duration}</span>}
                            {(task.id !== undefined ? linkedEventByTaskId.get(task.id) : 0) ? (
                              <span className="rounded-full border border-indigo-300/35 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-200">
                                Scheduled
                              </span>
                            ) : null}
                            {subtaskProgress && (
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                                {subtaskProgress}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
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
                    void beginConversationalFlow();
                  }
                }}
                className="rounded-lg border border-violet-300/35 bg-violet-500/20 px-3 py-2 text-xs font-medium text-violet-100 disabled:opacity-50"
              >
                {guidedLoading ? "Structuring..." : selectedMode === "guided_form" ? "Continue to guided draft" : "Start conversational intake"}
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
            await saveStructuredDraft(draft, draft.includeSubtasks);
          }}
        />
      )}

      {conversationalDraft && (
        <TasksConversationalIntakeSheet
          draft={conversationalDraft}
          clarifications={conversationalClarifications}
          onCancel={() => {
            setConversationalDraft(null);
            setConversationalClarifications([]);
          }}
          onSwitchToManualEdit={(draft, includeSubtasks) => {
            setConversationalDraft(null);
            setConversationalClarifications([]);
            setGuidedDraft({
              ...draft,
              suggestedSubtasks: includeSubtasks ? draft.suggestedSubtasks : [],
            });
            setGuidedClarifications([]);
          }}
          onSave={async (draft, includeSubtasks) => {
            await saveStructuredDraft(draft, includeSubtasks);
          }}
        />
      )}

      {actionTask && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45" onClick={() => setActionTask(null)}>
          <div className="w-full rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6 shadow-glass" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
            <p className="mb-2 text-xs text-slate-400">{actionTask.title}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={() => { setActiveTaskId(actionTask.id ?? null); setActionTask(null); }}>Open</button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={async () => {
                if (actionTask.id === undefined) return;
                const nextTitle = window.prompt("Rename task", actionTask.title)?.trim();
                if (!nextTitle) return;
                await updateTask(actionTask.id, { title: nextTitle });
                setActionTask(null);
              }}>Rename</button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={async () => {
                if (actionTask.id === undefined) return;
                await updateTask(actionTask.id, { isPinned: !actionTask.isPinned });
                setActionTask(null);
              }}>{actionTask.isPinned ? "Unpin" : "Pin"}</button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={async () => {
                if (actionTask.id === undefined) return;
                await updateTask(actionTask.id, { status: actionTask.status === "done" ? "todo" : "done" });
                setActionTask(null);
              }}>{actionTask.status === "done" ? "Reopen" : "Complete"}</button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={async () => {
                if (actionTask.id === undefined) return;
                await updateTask(actionTask.id, { status: actionTask.status === "archived" ? "todo" : "archived" });
                setActionTask(null);
              }}>{actionTask.status === "archived" ? "Unarchive" : "Archive"}</button>
              <button type="button" className="rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-200" onClick={() => void duplicateTask(actionTask)}>Duplicate</button>
              <button
                type="button"
                className="col-span-2 rounded-lg border border-indigo-300/35 bg-indigo-500/12 px-2 py-2 text-indigo-100"
                onClick={async () => {
                  await scheduleTask(actionTask);
                  setActionTask(null);
                }}
              >
                Schedule on calendar
              </button>
              <button
                type="button"
                className="col-span-2 rounded-lg border border-violet-300/35 bg-violet-500/12 px-2 py-2 text-violet-100"
                onClick={() => {
                  setOpenTaskIntelligenceOnMount(true);
                  setActiveTaskId(actionTask.id ?? null);
                  setActionTask(null);
                }}
              >
                Intelligence actions
              </button>
              <button type="button" className="col-span-2 rounded-lg border border-rose-300/30 px-2 py-2 text-rose-200" onClick={async () => {
                if (actionTask.id === undefined) return;
                await deleteTask(actionTask.id);
                setActionTask(null);
              }}>Delete</button>
              <button type="button" className="col-span-2 rounded-lg border border-noema-borderSoft px-2 py-2 text-slate-300" onClick={() => setActionTask(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
