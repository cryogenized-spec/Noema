import type { TaskRecord } from "@/types/tasks";

export interface TaskCalendarProjection {
  taskId: number;
  kind: "due" | "reminder";
  at: string;
  title: string;
  durationMinutes?: number;
}

export const projectTasksForCalendar = (tasks: TaskRecord[]): TaskCalendarProjection[] =>
  tasks.flatMap((task) => {
    if (!task.id || task.status === "archived") return [];
    const projections: TaskCalendarProjection[] = [];
    if (task.dueAt) {
      projections.push({
        taskId: task.id,
        kind: "due",
        at: task.dueAt,
        title: task.title,
        durationMinutes: task.estimatedDurationMinutes,
      });
    }
    if (task.reminderEnabled && task.reminderAt) {
      projections.push({
        taskId: task.id,
        kind: "reminder",
        at: task.reminderAt,
        title: task.title,
      });
    }
    return projections;
  });
