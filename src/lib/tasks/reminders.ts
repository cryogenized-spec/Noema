import type { TaskRecord, TaskReminderState } from "@/types/tasks";

export const deriveReminderState = (input: {
  reminderEnabled: boolean;
  reminderAt?: string;
  reminderState?: TaskReminderState;
}) => {
  if (!input.reminderEnabled) return "disabled" as const;
  if (!input.reminderAt) return "scheduled" as const;
  const timestamp = new Date(input.reminderAt).getTime();
  if (!Number.isFinite(timestamp)) return "scheduled" as const;
  if (input.reminderState === "sent" || input.reminderState === "failed") return input.reminderState;
  return timestamp <= Date.now() ? ("due" as const) : ("scheduled" as const);
};

export interface ReminderDispatchCandidate {
  taskId: number;
  title: string;
  reminderAt: string;
  reminderNote?: string;
}

export const collectReminderDispatchCandidates = (tasks: TaskRecord[], nowIso = new Date().toISOString()): ReminderDispatchCandidate[] => {
  const now = new Date(nowIso).getTime();
  return tasks.flatMap((task) => {
    if (!task.id || !task.reminderEnabled || !task.reminderAt) return [];
    const reminderTime = new Date(task.reminderAt).getTime();
    if (!Number.isFinite(reminderTime) || reminderTime > now) return [];
    if (task.status === "done" || task.status === "archived") return [];
    if (task.reminderState === "sent") return [];
    return [
      {
        taskId: task.id,
        title: task.title,
        reminderAt: task.reminderAt,
        reminderNote: task.reminderNote,
      },
    ];
  });
};
