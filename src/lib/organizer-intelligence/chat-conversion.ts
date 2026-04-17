import { createOrganizerDraftEnvelope } from "@/lib/organizer-intelligence/draft-output";
import type {
  OrganizerDraftEnvelope,
  OrganizerIntelligenceContext,
  OrganizerSourceContext,
} from "@/lib/organizer-intelligence/types";
import type { ChatMessage } from "@/types/chat";
import type { CreateCalendarEventInput } from "@/types/calendar";
import type { CreateDocumentInput } from "@/types/documents";
import type { CreateTaskInput, TaskPriority } from "@/types/tasks";

export type ChatOrganizerDraftTarget = "task" | "document" | "event";

interface BuildDraftFromMessagesInput {
  target: ChatOrganizerDraftTarget;
  messages: ChatMessage[];
  selectedAgentId?: number | null;
}

interface ParsedTimeHint {
  startAt?: string;
  endAt?: string;
  dueAt?: string;
  allDay: boolean;
}

const clampWords = (input: string, maxWords: number) =>
  input
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");

const createTitle = (text: string, fallback: string) => {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return fallback;

  const sanitized = firstLine.replace(/^[-*>\d.\s]+/, "").replace(/[#`*_~]/g, "").trim();
  const compact = clampWords(sanitized, 8);

  if (!compact) return fallback;
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
};

const inferPriority = (text: string): TaskPriority => {
  const lower = text.toLowerCase();
  if (/\b(asap|critical|immediately|urgent|tonight)\b/.test(lower)) return "urgent";
  if (/\b(important|soon|deadline)\b/.test(lower)) return "high";
  if (/\b(whenever|sometime|later)\b/.test(lower)) return "low";
  return "normal";
};

const parseTimeHint = (text: string): ParsedTimeHint => {
  const lower = text.toLowerCase();
  const now = new Date();

  const buildAt = (offsetDays: number, hour: number, minute = 0) => {
    const next = new Date(now);
    next.setDate(next.getDate() + offsetDays);
    next.setHours(hour, minute, 0, 0);
    return next;
  };

  const hourMatch = lower.match(/\b(at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  let hour = 9;
  let minute = 0;

  if (hourMatch) {
    hour = Number(hourMatch[2]);
    minute = hourMatch[3] ? Number(hourMatch[3]) : 0;
    const meridiem = hourMatch[4];
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (lower.includes("evening")) {
    hour = 19;
  } else if (lower.includes("morning")) {
    hour = 9;
  } else if (lower.includes("afternoon")) {
    hour = 14;
  }

  const durationMatch = lower.match(/(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)/);
  const durationMinutes = durationMatch
    ? Number(durationMatch[1]) * (durationMatch[2].startsWith("hour") || durationMatch[2].startsWith("hr") ? 60 : 1)
    : 60;

  let offsetDays = 0;
  if (lower.includes("tomorrow")) offsetDays = 1;
  else if (lower.includes("next week")) offsetDays = 7;
  else if (lower.includes("weekend")) {
    const day = now.getDay();
    offsetDays = day <= 6 ? (6 - day + 7) % 7 : 0;
  }

  const allDay = /\ball day\b/.test(lower);
  if (allDay) {
    const start = new Date(now);
    start.setDate(start.getDate() + offsetDays);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 0, 0);
    return { startAt: start.toISOString(), endAt: end.toISOString(), dueAt: start.toISOString(), allDay: true };
  }

  const start = buildAt(offsetDays, hour, minute);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    dueAt: start.toISOString(),
    allDay: false,
  };
};

const extractTags = (text: string) =>
  Array.from(
    new Set(
      [...text.matchAll(/#([a-zA-Z0-9_-]+)/g)]
        .map((match) => match[1]?.trim().toLowerCase())
        .filter((tag): tag is string => Boolean(tag)),
    ),
  );

const extractSubtasks = (text: string) => {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && line.length < 90);

  return lines.slice(0, 5).map((line, index) => ({
    id: `chat-subtask-${Date.now()}-${index}`,
    title: line,
    completed: false,
    order: index,
  }));
};

const mapTargetToContext = (target: ChatOrganizerDraftTarget): OrganizerIntelligenceContext => {
  if (target === "task") return "message_to_task";
  if (target === "document") return "message_to_document";
  return "message_to_event";
};

export const buildSourceContextFromMessages = (
  messages: ChatMessage[],
  context: OrganizerIntelligenceContext,
  selectedAgentId?: number | null,
): OrganizerSourceContext => {
  const now = new Date().toISOString();
  const excerpt = messages
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1800);

  return {
    entityType: "message",
    entityId: messages.map((message) => message.id).filter((id): id is number => typeof id === "number").join(","),
    contentExcerpt: excerpt,
    timestamp: now,
    selectedAgentId,
    invocationMode: context,
  };
};

const buildTaskDraft = (messages: ChatMessage[]): CreateTaskInput => {
  const text = messages.map((message) => message.content).join("\n\n").trim();
  const ids = messages.map((message) => message.id).filter((id): id is number => typeof id === "number");
  const timeHint = parseTimeHint(text);

  return {
    title: createTitle(text, "Task from chat"),
    descriptionMarkdown: text,
    priority: inferPriority(text),
    dueAt: timeHint.dueAt,
    subtasks: extractSubtasks(text).length >= 2 ? extractSubtasks(text) : undefined,
    sourceType: "message_conversion",
    sourceRef: ids.length ? { chatMessageIds: ids } : undefined,
    aiAssisted: true,
  };
};

const buildDocumentDraft = (messages: ChatMessage[]): CreateDocumentInput => {
  const text = messages.map((message) => message.content).join("\n\n").trim();
  const ids = messages.map((message) => message.id).filter((id): id is number => typeof id === "number");

  return {
    title: createTitle(text, "Chat note"),
    bodyMarkdown: text,
    tags: extractTags(text),
    sourceType: "chat_conversion",
    sourceRef: ids.length ? { chatMessageIds: ids } : undefined,
    frontmatterEnabled: true,
  };
};

const buildEventDraft = (messages: ChatMessage[]): CreateCalendarEventInput => {
  const text = messages.map((message) => message.content).join("\n\n").trim();
  const ids = messages.map((message) => message.id).filter((id): id is number => typeof id === "number");
  const timeHint = parseTimeHint(text);

  return {
    title: createTitle(text, "Event from chat"),
    descriptionMarkdown: text,
    startAt: timeHint.startAt ?? new Date().toISOString(),
    endAt: timeHint.endAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    allDay: timeHint.allDay,
    reminderEnabled: true,
    reminderAt: timeHint.startAt,
    sourceType: "ai_intake",
    sourceRef: ids.length ? { aiSessionId: `chat:${ids.join("-")}` } : undefined,
  };
};

export const buildChatOrganizerDraftEnvelope = ({
  target,
  messages,
  selectedAgentId,
}: BuildDraftFromMessagesInput): OrganizerDraftEnvelope => {
  const context = mapTargetToContext(target);
  const source = buildSourceContextFromMessages(messages, context, selectedAgentId);

  if (target === "task") {
    return createOrganizerDraftEnvelope({
      draftType: "task_draft",
      context,
      source,
      payload: { draft: buildTaskDraft(messages) },
    });
  }

  if (target === "document") {
    return createOrganizerDraftEnvelope({
      draftType: "document_draft",
      context,
      source,
      payload: { draft: buildDocumentDraft(messages) },
    });
  }

  return createOrganizerDraftEnvelope({
    draftType: "event_draft",
    context,
    source,
    payload: { draft: buildEventDraft(messages) },
  });
};

export const buildChatConversionPrompt = (target: ChatOrganizerDraftTarget, source: OrganizerSourceContext) => {
  const schemaByTarget = {
    task: `{"title":"string","descriptionMarkdown":"string","priority":"low|normal|high|urgent","dueAt":"ISO datetime or null","subtasks":[{"title":"string"}]}`,
    document: `{"title":"string","bodyMarkdown":"string","tags":["tag"]}`,
    event: `{"title":"string","descriptionMarkdown":"string","startAt":"ISO datetime","endAt":"ISO datetime","allDay":false,"reminderAt":"ISO datetime or null"}`,
  } as const;

  return [
    "Convert the source chat content into a structured organizer draft.",
    `Target: ${target}`,
    `Return strict JSON only matching this schema: ${schemaByTarget[target]}`,
    "Keep text concise and preserve user intent.",
    "If a field is unknown, return null instead of guessing wildly.",
    "Source content:",
    source.contentExcerpt,
  ].join("\n\n");
};

const safeJson = (input: string) => {
  const fencedMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : input;
  return JSON.parse(candidate);
};

export const mergeAiSuggestionIntoDraft = (
  envelope: OrganizerDraftEnvelope,
  content: string,
): OrganizerDraftEnvelope => {
  let parsed: unknown;
  try {
    parsed = safeJson(content);
  } catch {
    return envelope;
  }

  if (!parsed || typeof parsed !== "object") return envelope;

  if (envelope.draftType === "task_draft" && "draft" in envelope.payload) {
    const current = envelope.payload.draft as CreateTaskInput;
    const suggestion = parsed as Partial<CreateTaskInput> & { subtasks?: Array<{ title?: string }> };
    const subtasks = suggestion.subtasks?.filter((item) => item.title?.trim()).map((item, index) => ({
      id: `ai-subtask-${Date.now()}-${index}`,
      title: item.title!.trim(),
      completed: false,
      order: index,
    }));

    return {
      ...envelope,
      payload: {
        draft: {
          ...current,
          title: suggestion.title?.trim() || current.title,
          descriptionMarkdown: suggestion.descriptionMarkdown || current.descriptionMarkdown,
          dueAt: suggestion.dueAt ?? current.dueAt,
          priority: suggestion.priority ?? current.priority,
          subtasks: subtasks?.length ? subtasks : current.subtasks,
        },
      },
    };
  }

  if (envelope.draftType === "document_draft" && "draft" in envelope.payload) {
    const current = envelope.payload.draft as CreateDocumentInput;
    const suggestion = parsed as Partial<CreateDocumentInput>;
    return {
      ...envelope,
      payload: {
        draft: {
          ...current,
          title: suggestion.title?.trim() || current.title,
          bodyMarkdown: suggestion.bodyMarkdown || current.bodyMarkdown,
          tags: suggestion.tags?.length ? suggestion.tags : current.tags,
        },
      },
    };
  }

  if (envelope.draftType === "event_draft" && "draft" in envelope.payload) {
    const current = envelope.payload.draft as CreateCalendarEventInput;
    const suggestion = parsed as Partial<CreateCalendarEventInput>;
    return {
      ...envelope,
      payload: {
        draft: {
          ...current,
          title: suggestion.title?.trim() || current.title,
          descriptionMarkdown: suggestion.descriptionMarkdown || current.descriptionMarkdown,
          startAt: suggestion.startAt ?? current.startAt,
          endAt: suggestion.endAt ?? current.endAt,
          allDay: suggestion.allDay ?? current.allDay,
          reminderAt: suggestion.reminderAt ?? current.reminderAt,
        },
      },
    };
  }

  return envelope;
};
