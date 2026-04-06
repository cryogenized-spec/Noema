import type { CreateCalendarEventInput } from "@/types/calendar";
import type { TaskRecord } from "@/types/tasks";

export const projectTaskToCalendarEventInput = (task: TaskRecord): CreateCalendarEventInput | null => {
  if (!task.id || !task.dueAt || task.status === "archived") return null;
  const start = new Date(task.dueAt);
  const end = new Date(start.getTime() + Math.max(task.estimatedDurationMinutes ?? 30, 15) * 60_000);
  return {
    title: task.title,
    descriptionMarkdown: task.descriptionMarkdown,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    sourceType: "task_projection",
    sourceRef: {
      taskProjectionId: `task-${task.id}`,
      projectedAt: new Date().toISOString(),
    },
    linkedTaskId: task.id,
    reminderEnabled: task.reminderEnabled,
    reminderAt: task.reminderAt,
  };
};
