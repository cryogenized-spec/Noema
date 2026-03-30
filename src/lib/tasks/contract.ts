import { MARKDOWN_STORAGE_CONTRACT, normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { CreateTaskInput, TaskRecord, TaskStatus, TaskSubtask } from "@/types/tasks";

const normalizeTags = (tags?: string[]) => {
  if (!tags) return [];
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
};

const normalizeSubtasks = (subtasks?: TaskSubtask[]) => {
  if (!subtasks?.length) return undefined;
  return subtasks
    .map((subtask, index) => ({
      id: subtask.id,
      title: subtask.title.trim(),
      completed: Boolean(subtask.completed),
      order: Number.isFinite(subtask.order) ? subtask.order : index,
    }))
    .filter((subtask) => subtask.title.length > 0)
    .sort((a, b) => a.order - b.order);
};

const computeCompletedAt = (status: TaskStatus, explicitCompletedAt?: string) => {
  if (status === "done") return explicitCompletedAt ?? new Date().toISOString();
  return undefined;
};

export function createTaskRecord(input: CreateTaskInput): Omit<TaskRecord, "id"> {
  const now = new Date().toISOString();
  const normalizedStatus = input.status ?? "inbox";

  return {
    title: input.title.trim() || "Untitled Task",
    descriptionMarkdown: normalizeMarkdownSource(input.descriptionMarkdown ?? ""),
    status: normalizedStatus,
    priority: input.priority ?? "normal",
    createdAt: now,
    updatedAt: now,
    dueAt: input.dueAt,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    completedAt: computeCompletedAt(normalizedStatus, input.completedAt),
    tags: normalizeTags(input.tags),
    folderId: input.folderId?.trim() || undefined,
    isPinned: input.isPinned ?? false,
    sourceType: input.sourceType ?? "manual",
    sourceRef: input.sourceRef,
    intakeTranscript: input.intakeTranscript?.trim() || undefined,
    aiAssisted: input.aiAssisted ?? false,
    aiClarificationSummary: input.aiClarificationSummary?.trim() || undefined,
    subtasks: normalizeSubtasks(input.subtasks),
    reminderEnabled: input.reminderEnabled ?? false,
    reminderAt: input.reminderAt,
    reminderState: input.reminderEnabled ? input.reminderState ?? "scheduled" : "disabled",
    lastReminderAttemptAt: input.lastReminderAttemptAt,
    reminderNote: input.reminderNote?.trim() || undefined,
  };
}

export const TASK_MARKDOWN_CONTRACT = MARKDOWN_STORAGE_CONTRACT;
