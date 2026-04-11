import type { CalendarEventRecord, CreateCalendarEventInput } from "@/types/calendar";

export interface GuidedEventDraft extends CreateCalendarEventInput {
  scheduleAwarenessNote?: string;
}

export interface GuidedEventClarification {
  id: "start_time" | "duration" | "all_day" | "location";
  question: string;
  helpText?: string;
}

const normalizeTitle = (input: string) =>
  input
    .replace(/^(need to|please|book|schedule)\s+/i, "")
    .trim()
    .replace(/\.$/, "") || "Untitled event";

const detectBaseDate = (input: string) => {
  const now = new Date();
  if (/tomorrow/i.test(input)) {
    now.setDate(now.getDate() + 1);
    return now;
  }
  if (/next week/i.test(input)) {
    now.setDate(now.getDate() + 7);
    return now;
  }
  if (/saturday/i.test(input)) {
    const day = now.getDay();
    const offset = (6 - day + 7) % 7 || 7;
    now.setDate(now.getDate() + offset);
    return now;
  }
  return now;
};

const inferStart = (input: string) => {
  const base = detectBaseDate(input);
  const timeMatch = input.match(/\b(at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hour = Number(timeMatch[2]);
    const minute = Number(timeMatch[3] ?? 0);
    const meridiem = (timeMatch[4] ?? "").toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    base.setHours(hour, minute, 0, 0);
    return base;
  }

  if (/morning/i.test(input)) base.setHours(9, 0, 0, 0);
  else if (/afternoon/i.test(input)) base.setHours(14, 0, 0, 0);
  else if (/evening|dinner|tonight/i.test(input)) base.setHours(19, 0, 0, 0);
  else base.setHours(10, 0, 0, 0);
  return base;
};

const inferDurationMinutes = (input: string) => {
  const hourMatch = input.match(/(\d{1,2})\s*(hour|hours|hr|hrs)/i);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  const minuteMatch = input.match(/(\d{1,3})\s*(minute|minutes|min|mins)/i);
  if (minuteMatch) return Number(minuteMatch[1]);
  if (/dinner/i.test(input)) return 120;
  return 60;
};

const inferAllDay = (input: string) => /all day|full day/i.test(input);

const inferLocation = (input: string): string | undefined => {
  const atMatch = input.match(/\bat\s+([A-Za-z0-9'\-\s]{3,40})$/i);
  return atMatch?.[1]?.trim();
};

const parseSuggestionJson = (text: string): Partial<GuidedEventDraft> | null => {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<GuidedEventDraft>;
  } catch {
    return null;
  }
};

async function requestRuntimeSuggestion(input: string): Promise<Partial<GuidedEventDraft> | null> {
  try {
    const prompt = [
      "Convert this scheduling request into JSON.",
      "Keys: title, descriptionMarkdown, startAt, endAt, allDay, locationText, reminderEnabled, reminderAt.",
      "Use ISO strings for startAt/endAt/reminderAt when inferable. Omit unknown fields.",
      `Input: ${input}`,
    ].join("\n");

    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context: "calendar_guided_intake" }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { response?: string };
    if (!payload.response) return null;
    return parseSuggestionJson(payload.response);
  } catch {
    return null;
  }
}

export async function buildGuidedEventDraft(
  input: string,
  existingEvents: CalendarEventRecord[] = [],
): Promise<{ draft: GuidedEventDraft; clarifications: GuidedEventClarification[] }> {
  const trimmed = input.trim();
  const allDay = inferAllDay(trimmed);
  const start = inferStart(trimmed);
  const durationMinutes = inferDurationMinutes(trimmed);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const localDraft: GuidedEventDraft = {
    title: normalizeTitle(trimmed),
    descriptionMarkdown: trimmed,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    allDay,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    locationText: inferLocation(trimmed),
    reminderEnabled: true,
    reminderAt: new Date(start.getTime() - 60 * 60_000).toISOString(),
    sourceType: "ai_intake",
  };

  const aiDraft = await requestRuntimeSuggestion(trimmed);
  const draft: GuidedEventDraft = {
    ...localDraft,
    ...aiDraft,
    title: aiDraft?.title?.trim() || localDraft.title,
    descriptionMarkdown: aiDraft?.descriptionMarkdown?.trim() || localDraft.descriptionMarkdown,
    sourceType: "ai_intake",
  };

  const clarifications: GuidedEventClarification[] = [];
  if (!/(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2})/i.test(trimmed)) {
    clarifications.push({ id: "start_time", question: "Which day should I schedule this for?" });
  }
  if (!/(at\s+\d|morning|afternoon|evening|all day)/i.test(trimmed)) {
    clarifications.push({ id: "start_time", question: "What time should this start?", helpText: "Example: 7:00 PM" });
  }
  if (!/(hour|hours|min|minute)/i.test(trimmed)) {
    clarifications.push({ id: "duration", question: "How long should this event be?", helpText: "Example: 90 minutes" });
  }
  if (!draft.locationText && /(dinner|dentist|meeting|appointment)/i.test(trimmed)) {
    clarifications.push({ id: "location", question: "Do you want to add a location?" });
  }
  if (!draft.allDay && /(weekend|saturday|sunday)/i.test(trimmed) && !/(at\s+\d)/i.test(trimmed)) {
    clarifications.push({ id: "all_day", question: "Should this be an all-day block?" });
  }

  const startTime = new Date(draft.startAt ?? start.toISOString()).getTime();
  const endTime = new Date(draft.endAt ?? end.toISOString()).getTime();
  const overlaps = existingEvents.filter((event) => {
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();
    return startTime < eventEnd && endTime > eventStart;
  });
  if (overlaps.length > 0) {
    draft.scheduleAwarenessNote = `${overlaps.length} existing event(s) overlap this proposed time.`;
  }

  return { draft, clarifications };
}
