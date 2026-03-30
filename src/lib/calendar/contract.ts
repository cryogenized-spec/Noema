import { MARKDOWN_STORAGE_CONTRACT, normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { CalendarEventRecord, CreateCalendarEventInput } from "@/types/calendar";

const normalizeText = (value?: string) => value?.trim() || undefined;

export function createCalendarEventRecord(input: CreateCalendarEventInput): Omit<CalendarEventRecord, "id"> {
  const now = new Date().toISOString();
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

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
    reminderEnabled: input.reminderEnabled ?? false,
    reminderAt: input.reminderEnabled ? input.reminderAt : undefined,
    recurrenceRule: normalizeText(input.recurrenceRule),
    isPinned: input.isPinned ?? false,
  };
}

export const CALENDAR_MARKDOWN_CONTRACT = MARKDOWN_STORAGE_CONTRACT;
