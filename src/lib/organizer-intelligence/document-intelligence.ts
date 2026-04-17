import { createOrganizerDraftEnvelope } from "@/lib/organizer-intelligence/draft-output";
import type {
  OrganizerDraftEnvelope,
  OrganizerIntelligenceContext,
  OrganizerSourceContext,
} from "@/lib/organizer-intelligence/types";
import type { CreateCalendarEventInput } from "@/types/calendar";
import type { DocumentRecord } from "@/types/documents";
import type { CreateTaskInput, TaskSubtask } from "@/types/tasks";

export type DocumentIntelligenceAction =
  | "extract_tasks"
  | "extract_events"
  | "summarize_document"
  | "suggest_tags"
  | "refine_title"
  | "identify_actionable_items";

export interface DocumentIntelligenceResult {
  action: DocumentIntelligenceAction;
  drafts: OrganizerDraftEnvelope[];
}

const schemaByAction: Record<DocumentIntelligenceAction, string> = {
  extract_tasks: `{"tasks":[{"title":"string","descriptionMarkdown":"string","dueAt":"ISO datetime or null","priority":"low|normal|high|urgent"}]}`,
  extract_events: `{"events":[{"title":"string","descriptionMarkdown":"string","startAt":"ISO datetime","endAt":"ISO datetime","allDay":false,"reminderAt":"ISO datetime|null"}]}`,
  summarize_document: `{"summary":"string"}`,
  suggest_tags: `{"tags":["tag"]}`,
  refine_title: `{"title":"string"}`,
  identify_actionable_items: `{"items":[{"title":"string"}]}`,
};

const removeMarkdown = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const headingLines = (markdown: string) =>
  [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].trim()).filter(Boolean);

const checklistLines = (markdown: string) =>
  [...markdown.matchAll(/^[-*]\s+\[(?:\s|x|X)\]\s+(.+)$/gm)].map((match) => match[1].trim()).filter(Boolean);

const bulletLines = (markdown: string) =>
  [...markdown.matchAll(/^[-*]\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => line.length > 0 && !line.startsWith("["));

const extractTags = (markdown: string) => {
  const explicit = [...markdown.matchAll(/#([a-zA-Z0-9_-]+)/g)].map((match) => match[1].toLowerCase());
  const fromHeadings = headingLines(markdown)
    .flatMap((heading) => heading.split(/\s+/))
    .map((word) => word.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase())
    .filter((word) => word.length >= 4);

  return Array.from(new Set([...explicit, ...fromHeadings])).slice(0, 6);
};

const parseDateHint = (line: string) => {
  const lower = line.toLowerCase();
  const now = new Date();
  const date = new Date(now);
  let matched = false;

  if (lower.includes("tomorrow")) {
    date.setDate(date.getDate() + 1);
    matched = true;
  } else if (lower.includes("next week")) {
    date.setDate(date.getDate() + 7);
    matched = true;
  } else if (lower.includes("today") || lower.includes("tonight")) {
    matched = true;
  }

  const hourMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (hourMatch) {
    let hour = Number(hourMatch[1]);
    const minute = hourMatch[2] ? Number(hourMatch[2]) : 0;
    const meridiem = hourMatch[3];
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    date.setHours(hour, minute, 0, 0);
    matched = true;
  } else {
    date.setHours(9, 0, 0, 0);
  }

  if (!matched) return null;

  const end = new Date(date);
  end.setHours(end.getHours() + 1);

  return { startAt: date.toISOString(), endAt: end.toISOString() };
};

const createSource = (document: DocumentRecord, context: OrganizerIntelligenceContext): OrganizerSourceContext => ({
  entityType: "document",
  entityId: document.id,
  contentExcerpt: document.bodyMarkdown.slice(0, 1800),
  timestamp: new Date().toISOString(),
  invocationMode: context,
});

const taskDraftFromLine = (line: string, documentId?: number): CreateTaskInput => ({
  title: line.slice(0, 80),
  descriptionMarkdown: line,
  priority: /urgent|asap|important/i.test(line) ? "high" : "normal",
  dueAt: parseDateHint(line)?.startAt,
  sourceType: "document_conversion",
  sourceRef: documentId ? { documentIds: [documentId] } : undefined,
  aiAssisted: true,
});

const eventDraftFromLine = (line: string, documentId?: number): CreateCalendarEventInput | null => {
  const hint = parseDateHint(line);
  if (!hint) return null;

  return {
    title: line.slice(0, 80),
    descriptionMarkdown: line,
    startAt: hint.startAt,
    endAt: hint.endAt,
    allDay: false,
    reminderEnabled: true,
    reminderAt: hint.startAt,
    linkedDocumentId: documentId,
    sourceType: "ai_intake",
    sourceRef: documentId ? { aiSessionId: `doc:${documentId}` } : undefined,
  };
};

const mapActionToContext = (action: DocumentIntelligenceAction): OrganizerIntelligenceContext => {
  if (action === "extract_tasks") return "document_extract_tasks";
  if (action === "extract_events") return "document_extract_events";
  return "event_refine";
};

const summaryFromMarkdown = (markdown: string) => {
  const plain = removeMarkdown(markdown);
  if (!plain) return "";
  const sentences = plain.match(/[^.!?]+[.!?]?/g) ?? [plain];
  return sentences
    .slice(0, 3)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" ");
};

const actionableSubtasks = (markdown: string): TaskSubtask[] => {
  const lines = [...checklistLines(markdown), ...bulletLines(markdown)]
    .filter((line) => line.length > 0)
    .slice(0, 8);

  return lines.map((line, index) => ({
    id: `doc-action-${Date.now()}-${index}`,
    title: line,
    completed: false,
    order: index,
  }));
};

export const runDocumentIntelligence = (
  document: DocumentRecord,
  action: DocumentIntelligenceAction,
): DocumentIntelligenceResult => {
  const context = mapActionToContext(action);
  const source = createSource(document, context);

  if (action === "extract_tasks") {
    const candidates = [...checklistLines(document.bodyMarkdown), ...headingLines(document.bodyMarkdown), ...bulletLines(document.bodyMarkdown)]
      .filter((line) => line.length > 0)
      .slice(0, 6);

    const drafts = candidates.map((line) =>
      createOrganizerDraftEnvelope({
        draftType: "task_draft",
        context,
        source,
        payload: { draft: taskDraftFromLine(line, document.id) },
      }),
    );

    return { action, drafts };
  }

  if (action === "extract_events") {
    const candidates = [...checklistLines(document.bodyMarkdown), ...bulletLines(document.bodyMarkdown)]
      .filter((line) => /(today|tomorrow|next week|\bat\s+\d|\d{1,2}(?::\d{2})?\s*(am|pm))/i.test(line))
      .slice(0, 5);

    const drafts = candidates
      .map((line) => eventDraftFromLine(line, document.id))
      .filter((draft): draft is CreateCalendarEventInput => Boolean(draft))
      .map((draft) =>
        createOrganizerDraftEnvelope({
          draftType: "event_draft",
          context,
          source,
          payload: { draft },
        }),
      );

    return { action, drafts };
  }

  if (action === "summarize_document") {
    const summary = summaryFromMarkdown(document.bodyMarkdown);
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: {
            suggestions: {
              note: summary || "No concise summary could be generated from current content.",
            },
          },
        }),
      ],
    };
  }

  if (action === "suggest_tags") {
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: {
            suggestions: {
              tags: extractTags(document.bodyMarkdown),
            },
          },
        }),
      ],
    };
  }

  if (action === "refine_title") {
    const heading = headingLines(document.bodyMarkdown)[0];
    const summary = summaryFromMarkdown(document.bodyMarkdown);
    const suggestedTitle = heading || summary.split(" ").slice(0, 8).join(" ") || document.title;

    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "document_draft",
          context,
          source,
          payload: {
            draft: {
              title: suggestedTitle,
              bodyMarkdown: document.bodyMarkdown,
              tags: document.tags,
              sourceType: document.sourceType,
              sourceRef: document.sourceRef,
              frontmatterEnabled: document.frontmatterEnabled,
            },
          },
        }),
      ],
    };
  }

  return {
    action,
    drafts: [
      createOrganizerDraftEnvelope({
        draftType: "subtask_suggestion_draft",
        context,
        source,
        payload: {
          subtasks: actionableSubtasks(document.bodyMarkdown),
        },
      }),
    ],
  };
};

export const buildDocumentIntelligencePrompt = (
  document: DocumentRecord,
  action: DocumentIntelligenceAction,
  source: OrganizerSourceContext,
) =>
  [
    "Analyze the markdown document and respond with strict JSON only.",
    `Action: ${action}`,
    `Schema: ${schemaByAction[action]}`,
    "Keep output concise and practical.",
    "Document excerpt:",
    source.contentExcerpt,
  ].join("\n\n");

const safeJson = (input: string) => {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : input);
};

export const mergeDocumentIntelligenceSuggestion = (
  base: DocumentIntelligenceResult,
  content: string,
  document: DocumentRecord,
): DocumentIntelligenceResult => {
  let parsed: unknown;
  try {
    parsed = safeJson(content);
  } catch {
    return base;
  }

  if (!parsed || typeof parsed !== "object") return base;
  const first = base.drafts[0];

  if (base.action === "summarize_document" && first?.draftType === "metadata_suggestion_draft" && "suggestions" in first.payload) {
    const summary = (parsed as { summary?: string }).summary?.trim();
    if (!summary) return base;
    return {
      ...base,
      drafts: [
        {
          ...first,
          payload: { suggestions: { ...first.payload.suggestions, note: summary } },
        },
      ],
    };
  }

  if (base.action === "suggest_tags" && first?.draftType === "metadata_suggestion_draft" && "suggestions" in first.payload) {
    const tags = (parsed as { tags?: string[] }).tags?.map((tag) => tag.trim()).filter(Boolean);
    if (!tags?.length) return base;
    return {
      ...base,
      drafts: [{ ...first, payload: { suggestions: { ...first.payload.suggestions, tags } } }],
    };
  }

  if (base.action === "refine_title" && first?.draftType === "document_draft" && "draft" in first.payload) {
    const current = first.payload.draft as import("@/types/documents").CreateDocumentInput;
    const title = (parsed as { title?: string }).title?.trim();
    if (!title) return base;
    return {
      ...base,
      drafts: [
        {
          ...first,
          payload: {
            draft: {
              ...current,
              title,
              bodyMarkdown: document.bodyMarkdown,
            },
          },
        },
      ],
    };
  }

  return base;
};
