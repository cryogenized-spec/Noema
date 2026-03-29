import type { TaskPriority, TaskStatus, TaskSubtask } from "@/types/tasks";

export interface GuidedIntakeDraft {
  title: string;
  descriptionMarkdown: string;
  dueAt?: string;
  estimatedDurationMinutes?: number;
  priority: TaskPriority;
  status: TaskStatus;
  suggestedSubtasks: TaskSubtask[];
}

export interface GuidedClarification {
  id: "due_time" | "priority" | "duration" | "subtasks";
  question: string;
  helpText?: string;
}

const normalizeTitle = (input: string) =>
  input
    .replace(/^need to\s+/i, "")
    .replace(/^remind me to\s+/i, "")
    .trim()
    .replace(/\.$/, "");

const inferPriority = (input: string): TaskPriority => {
  if (/(urgent|asap|immediately|critical)/i.test(input)) return "urgent";
  if (/(tonight|today|deadline|important)/i.test(input)) return "high";
  if (/(sometime|later|eventually)/i.test(input)) return "low";
  return "normal";
};

const inferDueAt = (input: string): string | undefined => {
  const now = new Date();
  if (/tonight/i.test(input)) {
    const candidate = new Date(now);
    candidate.setHours(20, 0, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate.toISOString();
  }
  if (/tomorrow/i.test(input)) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(9, 0, 0, 0);
    return candidate.toISOString();
  }
  if (/this weekend/i.test(input)) {
    const candidate = new Date(now);
    const day = candidate.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    candidate.setDate(candidate.getDate() + daysUntilSaturday);
    candidate.setHours(10, 0, 0, 0);
    return candidate.toISOString();
  }
  return undefined;
};

const inferDuration = (input: string): number | undefined => {
  const minuteMatch = input.match(/(\d{1,3})\s*(min|mins|minutes)/i);
  if (minuteMatch) return Number(minuteMatch[1]);
  const hourMatch = input.match(/(\d{1,2})\s*(hour|hours|hr|hrs)/i);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  return undefined;
};

const suggestSubtasks = (input: string): TaskSubtask[] => {
  if (!/(prepare|organize|document|plan|project|research|apply)/i.test(input)) return [];
  return [
    { id: crypto.randomUUID(), title: "Gather key details", completed: false, order: 0 },
    { id: crypto.randomUUID(), title: "Draft a simple checklist", completed: false, order: 1 },
  ];
};

const parseSuggestionJson = (text: string): Partial<GuidedIntakeDraft> | null => {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuidedIntakeDraft>;
    return parsed;
  } catch {
    return null;
  }
};

async function requestRuntimeSuggestion(input: string): Promise<Partial<GuidedIntakeDraft> | null> {
  try {
    const prompt = [
      "Convert this task request into JSON with keys:",
      "title, descriptionMarkdown, dueAt, estimatedDurationMinutes, priority, status, suggestedSubtasks.",
      "Use ISO date if dueAt is inferable. Keep concise. If unknown, omit field.",
      `Input: ${input}`,
    ].join("\n");

    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context: "task_guided_intake" }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { response?: string };
    if (!payload.response) return null;
    return parseSuggestionJson(payload.response);
  } catch {
    return null;
  }
}

export async function buildGuidedIntakeDraft(input: string): Promise<{
  draft: GuidedIntakeDraft;
  clarifications: GuidedClarification[];
}> {
  const trimmedInput = input.trim();
  const localDraft: GuidedIntakeDraft = {
    title: normalizeTitle(trimmedInput) || "Untitled task",
    descriptionMarkdown: trimmedInput,
    dueAt: inferDueAt(trimmedInput),
    estimatedDurationMinutes: inferDuration(trimmedInput),
    priority: inferPriority(trimmedInput),
    status: "todo",
    suggestedSubtasks: suggestSubtasks(trimmedInput),
  };

  const aiDraft = await requestRuntimeSuggestion(trimmedInput);
  const merged: GuidedIntakeDraft = {
    ...localDraft,
    ...aiDraft,
    title: aiDraft?.title?.trim() || localDraft.title,
    descriptionMarkdown: aiDraft?.descriptionMarkdown?.trim() || localDraft.descriptionMarkdown,
    priority: (aiDraft?.priority as TaskPriority) || localDraft.priority,
    status: (aiDraft?.status as TaskStatus) || localDraft.status,
    suggestedSubtasks:
      aiDraft?.suggestedSubtasks?.map((subtask, index) => ({
        id: subtask.id || crypto.randomUUID(),
        title: subtask.title,
        completed: false,
        order: Number.isFinite(subtask.order) ? subtask.order : index,
      })) ?? localDraft.suggestedSubtasks,
  };

  const clarifications: GuidedClarification[] = [];
  if (!merged.dueAt && /(tonight|today|tomorrow|weekend)/i.test(trimmedInput)) {
    clarifications.push({ id: "due_time", question: "What time should I set for this?", helpText: "Examples: 7:30 PM, tomorrow 9 AM" });
  }
  if (!merged.estimatedDurationMinutes) {
    clarifications.push({ id: "duration", question: "About how long will this take?", helpText: "Optional, but helps later scheduling." });
  }
  if (merged.priority === "normal") {
    clarifications.push({ id: "priority", question: "Should this be urgent, high, normal, or low priority?" });
  }
  if (merged.suggestedSubtasks.length > 0) {
    clarifications.push({ id: "subtasks", question: "Would you like suggested subtasks for this?" });
  }

  return { draft: merged, clarifications };
}

