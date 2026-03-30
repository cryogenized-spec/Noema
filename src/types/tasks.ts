export type TaskStatus = "inbox" | "todo" | "doing" | "done" | "archived";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskIntakeMode = "guided_form" | "conversational";
export type TaskCaptureMethod = "type" | "voice";
export type TaskReminderState = "disabled" | "scheduled" | "due" | "sent" | "failed";
export type TaskSourceType =
  | "manual"
  | "voice_capture"
  | "ai_intake"
  | "message_conversion"
  | "document_conversion";

export interface TaskSourceRef {
  chatMessageIds?: number[];
  documentIds?: number[];
  voiceCaptureId?: string;
  aiSessionId?: string;
  [key: string]: string | number[] | undefined;
}

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

export interface TaskRecord {
  id?: number;
  title: string;
  descriptionMarkdown: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  estimatedDurationMinutes?: number;
  completedAt?: string;
  tags: string[];
  folderId?: string;
  isPinned: boolean;
  sourceType: TaskSourceType;
  sourceRef?: TaskSourceRef;
  intakeTranscript?: string;
  aiAssisted?: boolean;
  aiClarificationSummary?: string;
  subtasks?: TaskSubtask[];
  reminderEnabled: boolean;
  reminderAt?: string;
  reminderState: TaskReminderState;
  lastReminderAttemptAt?: string;
  reminderNote?: string;
}

export interface CreateTaskInput {
  title: string;
  descriptionMarkdown?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string;
  estimatedDurationMinutes?: number;
  completedAt?: string;
  tags?: string[];
  folderId?: string;
  isPinned?: boolean;
  sourceType?: TaskSourceType;
  sourceRef?: TaskSourceRef;
  intakeTranscript?: string;
  aiAssisted?: boolean;
  aiClarificationSummary?: string;
  subtasks?: TaskSubtask[];
  reminderEnabled?: boolean;
  reminderAt?: string;
  reminderState?: TaskReminderState;
  lastReminderAttemptAt?: string;
  reminderNote?: string;
}
