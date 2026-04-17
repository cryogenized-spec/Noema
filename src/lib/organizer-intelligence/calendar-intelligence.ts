import { createOrganizerDraftEnvelope } from "@/lib/organizer-intelligence/draft-output";
import type { OrganizerDraftEnvelope, OrganizerIntelligenceContext, OrganizerSourceContext } from "@/lib/organizer-intelligence/types";
import type { CalendarEventRecord, CreateCalendarEventInput } from "@/types/calendar";

export type CalendarIntelligenceAction =
  | "refine_event"
  | "suggest_timing"
  | "estimate_duration"
  | "suggest_reminder"
  | "detect_conflicts"
  | "suggest_alternate_times";

export interface CalendarIntelligenceResult {
  action: CalendarIntelligenceAction;
  drafts: OrganizerDraftEnvelope[];
}

const HOUR = 60 * 60 * 1000;

const asDate = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildSource = (event: Partial<CreateCalendarEventInput>, context: OrganizerIntelligenceContext): OrganizerSourceContext => ({
  entityType: "event",
  contentExcerpt: `${event.title ?? "Untitled event"}\n\n${event.descriptionMarkdown ?? ""}`.slice(0, 1600),
  timestamp: new Date().toISOString(),
  invocationMode: context,
});

const buildEventDraft = (event: Partial<CreateCalendarEventInput>, patch: Partial<CreateCalendarEventInput>): CreateCalendarEventInput => ({
  title: patch.title ?? event.title ?? "Untitled event",
  descriptionMarkdown: patch.descriptionMarkdown ?? event.descriptionMarkdown ?? "",
  startAt: patch.startAt ?? event.startAt ?? new Date().toISOString(),
  endAt: patch.endAt ?? event.endAt ?? new Date(Date.now() + HOUR).toISOString(),
  allDay: patch.allDay ?? event.allDay ?? false,
  timezone: patch.timezone ?? event.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  locationText: patch.locationText ?? event.locationText,
  notes: patch.notes ?? event.notes,
  status: patch.status ?? event.status,
  colorTag: patch.colorTag ?? event.colorTag,
  linkedTaskId: patch.linkedTaskId ?? event.linkedTaskId,
  linkedDocumentId: patch.linkedDocumentId ?? event.linkedDocumentId,
  sourceType: patch.sourceType ?? event.sourceType ?? "manual",
  sourceRef: patch.sourceRef ?? event.sourceRef,
  reminderEnabled: patch.reminderEnabled ?? event.reminderEnabled ?? false,
  reminderAt: patch.reminderAt ?? event.reminderAt,
  reminderState: patch.reminderState ?? event.reminderState,
  reminderNote: patch.reminderNote ?? event.reminderNote,
  recurrencePreset: patch.recurrencePreset ?? event.recurrencePreset ?? "none",
  recurrenceRule: patch.recurrenceRule ?? event.recurrenceRule,
  isPinned: patch.isPinned ?? event.isPinned ?? false,
});

const prettifyTitle = (title: string) =>
  title
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const detectOverlaps = (target: Partial<CreateCalendarEventInput>, events: CalendarEventRecord[]) => {
  const targetStart = asDate(target.startAt);
  const targetEnd = asDate(target.endAt);
  if (!targetStart || !targetEnd) return [];

  return events.filter((item) => {
    const start = asDate(item.startAt);
    const end = asDate(item.endAt);
    if (!start || !end) return false;
    return start < targetEnd && end > targetStart;
  });
};

export const runCalendarIntelligence = (
  event: Partial<CreateCalendarEventInput>,
  action: CalendarIntelligenceAction,
  existingEvents: CalendarEventRecord[] = [],
): CalendarIntelligenceResult => {
  const context: OrganizerIntelligenceContext = "event_refine";
  const source = buildSource(event, context);

  if (action === "refine_event") {
    const refinedTitle = prettifyTitle(event.title ?? "");
    const description = (event.descriptionMarkdown ?? "").trim();
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "event_draft",
          context,
          source,
          payload: {
            draft: buildEventDraft(event, {
              title: refinedTitle || event.title,
              descriptionMarkdown: description,
            }),
          },
        }),
      ],
    };
  }

  if (action === "estimate_duration") {
    const start = asDate(event.startAt) ?? new Date();
    const currentEnd = asDate(event.endAt);
    const currentDuration = currentEnd ? currentEnd.getTime() - start.getTime() : 0;
    const suggestedMinutes = currentDuration >= 15 * 60 * 1000 ? Math.round(currentDuration / 60_000) : 60;
    const endAt = new Date(start.getTime() + Math.max(30, Math.min(240, suggestedMinutes)) * 60_000).toISOString();

    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "event_draft",
          context,
          source,
          payload: { draft: buildEventDraft(event, { startAt: start.toISOString(), endAt }) },
        }),
      ],
    };
  }

  if (action === "suggest_reminder") {
    const start = asDate(event.startAt) ?? new Date(Date.now() + HOUR);
    const reminderAt = new Date(start.getTime() - 15 * 60_000).toISOString();
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "event_draft",
          context,
          source,
          payload: {
            draft: buildEventDraft(event, {
              reminderEnabled: true,
              reminderAt,
              reminderNote: event.reminderNote ?? "Suggested by calendar intelligence (15 min before).",
            }),
          },
        }),
      ],
    };
  }

  if (action === "suggest_timing") {
    const now = new Date();
    const nextSlot = new Date(now);
    const rounded = Math.ceil(now.getMinutes() / 30) * 30;
    nextSlot.setMinutes(rounded === 60 ? 0 : rounded, 0, 0);
    if (rounded === 60) nextSlot.setHours(nextSlot.getHours() + 1);
    if (nextSlot <= now) nextSlot.setHours(nextSlot.getHours() + 1);

    const endAt = new Date(nextSlot.getTime() + HOUR).toISOString();

    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "event_draft",
          context,
          source,
          payload: { draft: buildEventDraft(event, { startAt: nextSlot.toISOString(), endAt }) },
        }),
      ],
    };
  }

  if (action === "detect_conflicts") {
    const overlaps = detectOverlaps(event, existingEvents).slice(0, 4);
    const note = overlaps.length
      ? `Potential conflicts: ${overlaps
          .map((item) => `${item.title} (${new Date(item.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`)
          .join(", ")}`
      : "No conflicts detected for this time window.";

    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: { suggestions: { note } },
        }),
      ],
    };
  }

  const start = asDate(event.startAt) ?? new Date();
  const overlaps = detectOverlaps(event, existingEvents);
  const shiftHours = overlaps.length ? 2 : 1;
  const candidateStart = new Date(start.getTime() + shiftHours * HOUR);

  return {
    action,
    drafts: [
      createOrganizerDraftEnvelope({
        draftType: "metadata_suggestion_draft",
        context,
        source,
        payload: {
          suggestions: {
            note: `Alternate slot suggestion: ${candidateStart.toLocaleString()} for ~60 minutes.`,
          },
        },
      }),
      createOrganizerDraftEnvelope({
        draftType: "event_draft",
        context,
        source,
        payload: {
          draft: buildEventDraft(event, {
            startAt: candidateStart.toISOString(),
            endAt: new Date(candidateStart.getTime() + HOUR).toISOString(),
          }),
        },
      }),
    ],
  };
};
