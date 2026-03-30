export type CalendarEventStatus = "scheduled" | "completed" | "cancelled" | "archived";
export type CalendarEventSourceType = "manual" | "task_projection" | "ai_intake" | "import";

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
  recurrenceRule?: string;
  isPinned?: boolean;
}
