import { createOrganizerDraftEnvelope } from "@/lib/organizer-intelligence/draft-output";
import type {
  OrganizerDraftEnvelope,
  OrganizerIntelligenceContext,
  OrganizerSourceContext,
} from "@/lib/organizer-intelligence/types";
import type { CreateTaskInput, TaskPriority, TaskRecord, TaskSubtask } from "@/types/tasks";

export type TaskIntelligenceAction =
  | "breakdown_subtasks"
  | "rewrite_task"
  | "summarize_progress"
  | "estimate_effort"
  | "suggest_priority"
  | "suggest_next_action"
  | "suggest_due_direction"
  | "merge_refine_description";

export interface TaskIntelligenceResult {
  action: TaskIntelligenceAction;
  drafts: OrganizerDraftEnvelope[];
}

const schemaByAction: Record<TaskIntelligenceAction, string> = {
  breakdown_subtasks: `{"subtasks":[{"title":"string"}]}`,
  rewrite_task: `{"title":"string","descriptionMarkdown":"string"}`,
  summarize_progress: `{"summary":"string"}`,
  estimate_effort: `{"estimatedDurationMinutes":90,"note":"string"}`,
  suggest_priority: `{"priority":"low|normal|high|urgent","reason":"string"}`,
  suggest_next_action: `{"nextAction":"string"}`,
  suggest_due_direction: `{"dueSuggestion":"string","schedulingDirection":"string"}`,
  merge_refine_description: `{"descriptionMarkdown":"string"}`,
};

const stripMd = (value: string) => value.replace(/[#>*_`~\-]/g, " ").replace(/\s+/g, " ").trim();

const sourceFromTask = (task: TaskRecord, context: OrganizerIntelligenceContext): OrganizerSourceContext => ({
  entityType: "task",
  entityId: task.id,
  contentExcerpt: `${task.title}\n\n${task.descriptionMarkdown}`.slice(0, 1600),
  timestamp: new Date().toISOString(),
  invocationMode: context,
});

const priorityFromText = (text: string): TaskPriority => {
  const lower = text.toLowerCase();
  if (/urgent|blocker|asap|deadline/.test(lower)) return "urgent";
  if (/important|high priority|soon/.test(lower)) return "high";
  if (/optional|later|backlog/.test(lower)) return "low";
  return "normal";
};

const extractCandidateSubtasks = (task: TaskRecord): TaskSubtask[] => {
  const fromChecklist = [...task.descriptionMarkdown.matchAll(/^[-*]\s+\[(?:\s|x|X)\]\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const fromBullets = [...task.descriptionMarkdown.matchAll(/^[-*]\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("["));
  const fromSentences = stripMd(task.descriptionMarkdown)
    .split(/[.!?]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 12)
    .slice(0, 4);

  const lines = Array.from(new Set([...fromChecklist, ...fromBullets, ...fromSentences])).slice(0, 8);

  return lines.map((line, index) => ({
    id: `task-intel-subtask-${Date.now()}-${index}`,
    title: line,
    completed: false,
    order: index,
  }));
};

const mapActionToContext = (action: TaskIntelligenceAction): OrganizerIntelligenceContext => {
  if (action === "breakdown_subtasks") return "task_breakdown";
  if (action === "suggest_due_direction") return "task_schedule";
  return "event_refine";
};

const buildTaskDraft = (task: TaskRecord, patch: Partial<CreateTaskInput>): CreateTaskInput => ({
  title: patch.title ?? task.title,
  descriptionMarkdown: patch.descriptionMarkdown ?? task.descriptionMarkdown,
  status: patch.status ?? task.status,
  priority: patch.priority ?? task.priority,
  dueAt: patch.dueAt ?? task.dueAt,
  estimatedDurationMinutes: patch.estimatedDurationMinutes ?? task.estimatedDurationMinutes,
  tags: patch.tags ?? task.tags,
  folderId: patch.folderId ?? task.folderId,
  isPinned: patch.isPinned ?? task.isPinned,
  sourceType: task.sourceType,
  sourceRef: task.sourceRef,
  subtasks: patch.subtasks ?? task.subtasks,
  aiAssisted: true,
});

export const runTaskIntelligence = (task: TaskRecord, action: TaskIntelligenceAction): TaskIntelligenceResult => {
  const context = mapActionToContext(action);
  const source = sourceFromTask(task, context);

  if (action === "breakdown_subtasks") {
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "subtask_suggestion_draft",
          context,
          source,
          payload: {
            subtasks: extractCandidateSubtasks(task),
          },
        }),
      ],
    };
  }

  if (action === "rewrite_task") {
    const refinedTitle = task.title.length > 80 ? task.title.slice(0, 80) : task.title;
    const refinedDescription = stripMd(task.descriptionMarkdown);
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "task_draft",
          context,
          source,
          payload: {
            draft: buildTaskDraft(task, {
              title: refinedTitle,
              descriptionMarkdown: refinedDescription || task.descriptionMarkdown,
            }),
          },
        }),
      ],
    };
  }

  if (action === "summarize_progress") {
    const total = task.subtasks?.length ?? 0;
    const done = task.subtasks?.filter((subtask) => subtask.completed).length ?? 0;
    const summary = `${task.title}: ${done}/${total} subtasks complete. Status is ${task.status}.`;
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: { suggestions: { note: summary } },
        }),
      ],
    };
  }

  if (action === "estimate_effort") {
    const suggestedMinutes = Math.max(30, Math.min(240, (stripMd(task.descriptionMarkdown).split(" ").length || 20) * 3));
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: {
            suggestions: {
              note: `Suggested effort: about ${suggestedMinutes} minutes based on current description depth.`,
            },
          },
        }),
        createOrganizerDraftEnvelope({
          draftType: "task_draft",
          context,
          source,
          payload: {
            draft: buildTaskDraft(task, {
              estimatedDurationMinutes: suggestedMinutes,
            }),
          },
        }),
      ],
    };
  }

  if (action === "suggest_priority") {
    const priority = priorityFromText(`${task.title} ${task.descriptionMarkdown}`);
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: { suggestions: { priority, note: `Suggested priority: ${priority}.` } },
        }),
        createOrganizerDraftEnvelope({
          draftType: "task_draft",
          context,
          source,
          payload: {
            draft: buildTaskDraft(task, { priority }),
          },
        }),
      ],
    };
  }

  if (action === "suggest_next_action") {
    const next = extractCandidateSubtasks(task)[0]?.title || "Define the very next concrete step.";
    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: { suggestions: { note: `Suggested next action: ${next}` } },
        }),
      ],
    };
  }

  if (action === "suggest_due_direction") {
    const dueSuggestion = task.dueAt
      ? `Current due date ${new Date(task.dueAt).toLocaleString()} looks set.`
      : "No due date set. Consider setting one within the next 7 days.";

    return {
      action,
      drafts: [
        createOrganizerDraftEnvelope({
          draftType: "metadata_suggestion_draft",
          context,
          source,
          payload: { suggestions: { note: dueSuggestion } },
        }),
      ],
    };
  }

  return {
    action,
    drafts: [
      createOrganizerDraftEnvelope({
        draftType: "task_draft",
        context,
        source,
        payload: {
          draft: buildTaskDraft(task, {
            descriptionMarkdown: stripMd(task.descriptionMarkdown) || task.descriptionMarkdown,
          }),
        },
      }),
    ],
  };
};

export const buildTaskIntelligencePrompt = (task: TaskRecord, action: TaskIntelligenceAction, source: OrganizerSourceContext) =>
  [
    "Analyze this task and return strict JSON only.",
    `Action: ${action}`,
    `Schema: ${schemaByAction[action]}`,
    "Keep output concise and actionable.",
    "Task content:",
    source.contentExcerpt,
  ].join("\n\n");

const safeJson = (input: string) => {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : input);
};

export const mergeTaskIntelligenceSuggestion = (base: TaskIntelligenceResult, content: string, task: TaskRecord): TaskIntelligenceResult => {
  let parsed: unknown;
  try {
    parsed = safeJson(content);
  } catch {
    return base;
  }

  if (!parsed || typeof parsed !== "object") return base;

  if (base.action === "rewrite_task") {
    const first = base.drafts.find((draft) => draft.draftType === "task_draft");
    if (!first || !("draft" in first.payload)) return base;
    const current = first.payload.draft as CreateTaskInput;
    const suggestion = parsed as Partial<CreateTaskInput>;
    return {
      ...base,
      drafts: base.drafts.map((draft) =>
        draft === first
          ? {
              ...draft,
              payload: {
                draft: {
                  ...current,
                  title: suggestion.title?.trim() || task.title,
                  descriptionMarkdown: suggestion.descriptionMarkdown || task.descriptionMarkdown,
                },
              },
            }
          : draft,
      ),
    };
  }

  if (base.action === "suggest_priority") {
    const suggestion = parsed as { priority?: TaskPriority; reason?: string };
    if (!suggestion.priority) return base;
    return {
      ...base,
      drafts: base.drafts.map((draft) => {
        if (draft.draftType === "task_draft" && "draft" in draft.payload) {
          return {
            ...draft,
            payload: {
              draft: {
                ...(draft.payload.draft as CreateTaskInput),
                priority: suggestion.priority,
              },
            },
          };
        }
        if (draft.draftType === "metadata_suggestion_draft" && "suggestions" in draft.payload) {
          return {
            ...draft,
            payload: {
              suggestions: {
                ...draft.payload.suggestions,
                priority: suggestion.priority,
                note: suggestion.reason || draft.payload.suggestions.note,
              },
            },
          };
        }
        return draft;
      }),
    };
  }

  return base;
};
