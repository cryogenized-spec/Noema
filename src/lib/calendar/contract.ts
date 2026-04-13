import { MARKDOWN_STORAGE_CONTRACT, normalizeMarkdownSource } from "@/lib/markdown/contract";
import { recurrenceRuleFromPreset } from "@/lib/calendar/recurrence";
import { deriveCalendarReminderState } from "@/lib/calendar/reminders";
import type { CalendarEventRecord, CreateCalendarEventInput } from "@/types/calendar";

const normalizeText = (value?: string) => value?.trim() || undefined;

export function createCalendarEventRecord(input: CreateCalendarEventInput): Omit<CalendarEventRecord, "id"> {
  const now = new Date().toISOString();
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const recurrencePreset = input.recurrencePreset ?? "none";
  const reminderEnabled = input.reminderEnabled ?? false;
  const reminderAt = reminderEnabled ? input.reminderAt : undefined;

  return {
    title: input.title.trim() || "Untitled event",
    descriptionMarkdown: normalizeMarkdownSource(input.descriptionMarkdown ?? ""),
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    timezone,
    locationText: normalizeText(input.locationText),
    notes: normalizeText(input.notes),
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "scheduled",
    colorTag: normalizeText(input.colorTag),
    linkedTaskId: input.linkedTaskId,
    linkedDocumentId: input.linkedDocumentId,
    sourceType: input.sourceType ?? "manual",
    sourceRef: input.sourceRef,
    reminderEnabled,
    reminderAt,
    reminderState: deriveCalendarReminderState({
      reminderEnabled,
      reminderAt,
      reminderState: input.reminderState,
    }),
    lastReminderAttemptAt: input.lastReminderAttemptAt,
    reminderNote: normalizeText(input.reminderNote),
    recurrencePreset,
    recurrenceRule: recurrenceRuleFromPreset(recurrencePreset, normalizeText(input.recurrenceRule)),
    isPinned: input.isPinned ?? false,
  };
}

export const CALENDAR_MARKDOWN_CONTRACT = MARKDOWN_STORAGE_CONTRACT;
