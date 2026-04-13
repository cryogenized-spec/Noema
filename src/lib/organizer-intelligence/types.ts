import type { AgentInvocationMode, AgentOutputMode } from "@/lib/runtime/types";
import type { CreateCalendarEventInput } from "@/types/calendar";
import type { CreateDocumentInput } from "@/types/documents";
import type { CreateTaskInput, TaskSubtask } from "@/types/tasks";

export type OrganizerEntityType = "message" | "document" | "task" | "event" | "organizer";

export type OrganizerIntelligenceContext =
  | "message_to_task"
  | "message_to_document"
  | "message_to_event"
  | "document_extract_tasks"
  | "document_extract_events"
  | "task_breakdown"
  | "task_schedule"
  | "event_refine"
  | "organizer_summary";

export interface OrganizerSourceContext {
  entityType: OrganizerEntityType;
  entityId?: number | string;
  contentExcerpt: string;
  timestamp: string;
  selectedAgentId?: number | null;
  invocationMode: OrganizerIntelligenceContext;
}

export type OrganizerDraftType =
  | "task_draft"
  | "document_draft"
  | "event_draft"
  | "metadata_suggestion_draft"
  | "subtask_suggestion_draft";

export interface TaskDraftPayload {
  draft: CreateTaskInput;
}

export interface DocumentDraftPayload {
  draft: CreateDocumentInput;
}

export interface EventDraftPayload {
  draft: CreateCalendarEventInput;
}

export interface MetadataSuggestionDraftPayload {
  suggestions: {
    tags?: string[];
    folderId?: string;
    priority?: CreateTaskInput["priority"];
    reminderAt?: string;
    note?: string;
  };
}

export interface SubtaskSuggestionDraftPayload {
  subtasks: TaskSubtask[];
}

export type OrganizerDraftPayload =
  | TaskDraftPayload
  | DocumentDraftPayload
  | EventDraftPayload
  | MetadataSuggestionDraftPayload
  | SubtaskSuggestionDraftPayload;

export type OrganizerDraftReviewState = "proposed" | "accepted" | "edited" | "discarded";

export interface OrganizerDraftEnvelope {
  id: string;
  draftType: OrganizerDraftType;
  context: OrganizerIntelligenceContext;
  source: OrganizerSourceContext;
  payload: OrganizerDraftPayload;
  reviewState: OrganizerDraftReviewState;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerIntelligenceInvocation {
  context: OrganizerIntelligenceContext;
  source: OrganizerSourceContext;
  prompt: string;
  selectedAgentId?: number | null;
  outputMode?: AgentOutputMode;
}

export interface OrganizerAgentRoutingDecision {
  agentId: number | null;
  usedDefault: boolean;
  reason: "explicit" | "default" | "unavailable";
}

export interface OrganizerRuntimeRequest {
  context: OrganizerIntelligenceContext;
  runtimeMode: AgentInvocationMode;
  outputMode: AgentOutputMode;
  source: OrganizerSourceContext;
  prompt: string;
  selectedAgentId: number;
}
