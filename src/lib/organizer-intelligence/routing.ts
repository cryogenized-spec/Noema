import type { AgentProfile } from "@/types/agents";
import type { OrganizerAgentRoutingDecision } from "@/lib/organizer-intelligence/types";

interface ResolveOrganizerAgentInput {
  selectedAgentId?: number | null;
  defaultOrganizerAgentId?: number | null;
  agents: AgentProfile[];
}

const hasAgent = (id: number | null | undefined, agents: AgentProfile[]) =>
  typeof id === "number" && agents.some((agent) => agent.id === id);

export const resolveOrganizerAgent = ({
  selectedAgentId,
  defaultOrganizerAgentId,
  agents,
}: ResolveOrganizerAgentInput): OrganizerAgentRoutingDecision => {
  if (hasAgent(selectedAgentId, agents)) {
    return {
      agentId: selectedAgentId ?? null,
      usedDefault: false,
      reason: "explicit",
    };
  }

  if (hasAgent(defaultOrganizerAgentId, agents)) {
    return {
      agentId: defaultOrganizerAgentId ?? null,
      usedDefault: true,
      reason: "default",
    };
  }

  return {
    agentId: null,
    usedDefault: false,
    reason: "unavailable",
  };
};
