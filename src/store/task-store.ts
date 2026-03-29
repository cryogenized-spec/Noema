"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { createTaskRecord } from "@/lib/tasks/contract";
import { normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { CreateTaskInput, TaskRecord, TaskStatus } from "@/types/tasks";

const sortTasks = (tasks: TaskRecord[]) =>
  [...tasks].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt));

interface TaskState {
  tasks: TaskRecord[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateTasks: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<TaskRecord>;
  updateTask: (id: number, patch: Partial<CreateTaskInput>) => Promise<void>;
  setTaskStatus: (id: number, status: TaskStatus) => Promise<void>;
  pinTask: (id: number, isPinned: boolean) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
}

const normalizePatch = (patch: Partial<CreateTaskInput>, current: TaskRecord) => {
  const nextStatus = patch.status ?? current.status;
  const completedAt = nextStatus === "done" ? patch.completedAt ?? current.completedAt ?? new Date().toISOString() : undefined;

  return {
    title: patch.title?.trim() ?? current.title,
    descriptionMarkdown:
      patch.descriptionMarkdown !== undefined ? normalizeMarkdownSource(patch.descriptionMarkdown) : current.descriptionMarkdown,
    status: nextStatus,
    priority: patch.priority ?? current.priority,
    dueAt: patch.dueAt ?? current.dueAt,
    estimatedDurationMinutes: patch.estimatedDurationMinutes ?? current.estimatedDurationMinutes,
    completedAt,
    tags: patch.tags ?? current.tags,
    folderId: patch.folderId ?? current.folderId,
    isPinned: patch.isPinned ?? current.isPinned,
    sourceType: patch.sourceType ?? current.sourceType,
    sourceRef: patch.sourceRef ?? current.sourceRef,
    intakeTranscript: patch.intakeTranscript ?? current.intakeTranscript,
    aiAssisted: patch.aiAssisted ?? current.aiAssisted,
    aiClarificationSummary: patch.aiClarificationSummary ?? current.aiClarificationSummary,
    subtasks: patch.subtasks ?? current.subtasks,
    updatedAt: new Date().toISOString(),
  } satisfies Omit<TaskRecord, "id" | "createdAt"> & { updatedAt: string };
};

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  hydrated: false,
  hydrating: false,
  hydrateTasks: async () => {
    if (get().hydrating || get().hydrated) return;
    set({ hydrating: true });
    try {
      const tasks = await db.tasks.toArray();
      set({ tasks: sortTasks(tasks), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  createTask: async (input) => {
    const record = createTaskRecord(input);
    const id = await db.tasks.add(record);
    const persisted = { ...record, id };
    set((state) => ({ tasks: sortTasks([persisted, ...state.tasks]) }));
    return persisted;
  },
  updateTask: async (id, patch) => {
    const current = get().tasks.find((task) => task.id === id);
    if (!current) return;
    const next = normalizePatch(patch, current);
    await db.tasks.update(id, next);
    set((state) => ({
      tasks: sortTasks(state.tasks.map((task) => (task.id === id ? { ...task, ...next } : task))),
    }));
  },
  setTaskStatus: async (id, status) => {
    const current = get().tasks.find((task) => task.id === id);
    if (!current) return;
    const next = normalizePatch({ status }, current);
    await db.tasks.update(id, next);
    set((state) => ({
      tasks: sortTasks(state.tasks.map((task) => (task.id === id ? { ...task, ...next } : task))),
    }));
  },
  pinTask: async (id, isPinned) => {
    const updatedAt = new Date().toISOString();
    await db.tasks.update(id, { isPinned, updatedAt });
    set((state) => ({
      tasks: sortTasks(state.tasks.map((task) => (task.id === id ? { ...task, isPinned, updatedAt } : task))),
    }));
  },
  deleteTask: async (id) => {
    await db.tasks.delete(id);
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
  },
}));

