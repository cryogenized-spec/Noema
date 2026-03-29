"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { useTaskStore } from "@/store/task-store";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/tasks";

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
  const { tasks, hydrated, hydrating, hydrateTasks, createTask } = useTaskStore();
  const [activeFilter, setActiveFilter] = useState<TaskQuickFilter>("today");
  const [notice, setNotice] = useState("");

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
    await createTask({
      title: `Task ${taskNumber}`,
      descriptionMarkdown: "",
      status: "inbox",
      priority: "normal",
      sourceType: "manual",
      tags: ["task"],
    });
    setActiveFilter("all");
    setNotice("Task created. Task intake/editor flow comes next.");
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
        onClick={() => void handleCreate()}
        className="absolute bottom-0 right-1 inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/25 text-violet-100 shadow-glass"
      >
        <Icon icon="solar:add-circle-bold" className="text-2xl" />
      </button>
    </section>
  );
}

