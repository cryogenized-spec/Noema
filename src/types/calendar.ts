export type CalendarEventStatus = "scheduled" | "completed" | "cancelled" | "archived";
export type CalendarEventSourceType = "manual" | "task_projection" | "ai_intake" | "import";
export type CalendarReminderState = "disabled" | "scheduled" | "due" | "sent" | "failed";
export type CalendarRecurrencePreset = "none" | "daily" | "weekly" | "monthly" | "custom";

export interface CalendarEventSourceRef {
  taskProjectionId?: string;
  importBatchId?: string;
  aiSessionId?: string;
  [key: string]: string | number | undefined;
}

export interface CalendarEventRecord {
  id?: number;
  title: string;
  descriptionMarkdown: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  locationText?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  status: CalendarEventStatus;
  colorTag?: string;
  linkedTaskId?: number;
  linkedDocumentId?: number;
  sourceType: CalendarEventSourceType;
  sourceRef?: CalendarEventSourceRef;
  reminderEnabled: boolean;
  reminderAt?: string;
  reminderState: CalendarReminderState;
  lastReminderAttemptAt?: string;
  reminderNote?: string;
  recurrencePreset: CalendarRecurrencePreset;
  recurrenceRule?: string;
  isPinned: boolean;
}

export interface CreateCalendarEventInput {
  title: string;
  descriptionMarkdown?: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  timezone?: string;
  locationText?: string;
  notes?: string;
  status?: CalendarEventStatus;
  colorTag?: string;
  linkedTaskId?: number;
  linkedDocumentId?: number;
  sourceType?: CalendarEventSourceType;
  sourceRef?: CalendarEventSourceRef;
  reminderEnabled?: boolean;
  reminderAt?: string;
  reminderState?: CalendarReminderState;
  lastReminderAttemptAt?: string;
  reminderNote?: string;
  recurrencePreset?: CalendarRecurrencePreset;
  recurrenceRule?: string;
  isPinned?: boolean;
}
