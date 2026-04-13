import type { AgentInvocationMode, AgentOutputMode } from "@/lib/runtime/types";
import {
  type OrganizerIntelligenceContext,
  type OrganizerIntelligenceInvocation,
  type OrganizerRuntimeRequest,
} from "@/lib/organizer-intelligence/types";
import { resolveOrganizerAgent } from "@/lib/organizer-intelligence/routing";
import type { AgentProfile } from "@/types/agents";

const runtimeModeByContext: Record<OrganizerIntelligenceContext, AgentInvocationMode> = {
  message_to_task: "summarize_message",
  message_to_document: "summarize_message",
  message_to_event: "summarize_message",
  document_extract_tasks: "summarize_message",
  document_extract_events: "summarize_message",
  task_breakdown: "explain_message",
  task_schedule: "rewrite_message",
  event_refine: "rewrite_message",
  organizer_summary: "summarize_message",
};

const defaultOutputModeByContext: Partial<Record<OrganizerIntelligenceContext, AgentOutputMode>> = {
  message_to_task: "private_draft",
  message_to_document: "private_draft",
  message_to_event: "private_draft",
  document_extract_tasks: "private_draft",
  document_extract_events: "private_draft",
  task_breakdown: "private_draft",
  task_schedule: "private_draft",
  event_refine: "private_draft",
  organizer_summary: "private_draft",
};

interface BuildOrganizerRuntimeRequestInput {
  invocation: OrganizerIntelligenceInvocation;
  agents: AgentProfile[];
  defaultOrganizerAgentId?: number | null;
}

export type OrganizerRuntimeRequestResult =
  | { ok: true; request: OrganizerRuntimeRequest }
  | {
      ok: false;
      code: "AGENT_UNAVAILABLE";
      message: string;
    };

export const buildOrganizerRuntimeRequest = ({
  invocation,
  agents,
  defaultOrganizerAgentId,
}: BuildOrganizerRuntimeRequestInput): OrganizerRuntimeRequestResult => {
  const routing = resolveOrganizerAgent({
    selectedAgentId: invocation.selectedAgentId ?? invocation.source.selectedAgentId,
    defaultOrganizerAgentId,
    agents,
  });

  if (routing.agentId === null) {
    return {
      ok: false,
      code: "AGENT_UNAVAILABLE",
      message: "No organizer agent is selected. Set a default organizer agent or choose one for this action.",
    };
  }

  return {
    ok: true,
    request: {
      context: invocation.context,
      runtimeMode: runtimeModeByContext[invocation.context],
      outputMode: invocation.outputMode ?? defaultOutputModeByContext[invocation.context] ?? "private_draft",
      source: invocation.source,
      prompt: invocation.prompt,
      selectedAgentId: routing.agentId,
    },
  };
};
