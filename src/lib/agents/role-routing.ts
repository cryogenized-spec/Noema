import type { AgentRole } from "@/types/agents";

/** Adapted from RADIX's six colour-coded role pins.
 * These are local routing PREFERENCES, not permissions or active network routes.
 */
export const AGENT_ROLE_DEFINITIONS: ReadonlyArray<{
  id: AgentRole;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}> = [
  { id: "primary", label: "Reception / Chat", shortLabel: "Chat", color: "#ef4444",
    description: "Primary contact for incoming conversation requests." },
  { id: "organizer", label: "Organizer", shortLabel: "Organize", color: "#3b82f6",
    description: "Planning and organisation within owner-approved resources." },
  { id: "feed", label: "Feed", shortLabel: "Feed", color: "#22c55e",
    description: "Curated updates, announcements and feed drafting." },
  { id: "channeler", label: "Channels", shortLabel: "Channels", color: "#06b6d4",
    description: "Channel-specific moderation and communication." },
  { id: "workbench", label: "Workbench", shortLabel: "Workbench", color: "#a855f7",
    description: "Projects, maker collaboration and workshop assistance." },
  { id: "media", label: "Media / Calls", shortLabel: "Media", color: "#eab308",
    description: "Visual media, stickers and future call experiences." },
] as const;

const allowed = new Set<AgentRole>(AGENT_ROLE_DEFINITIONS.map((item) => item.id));
export function normalizeAgentRoles(value: unknown): AgentRole[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((role): role is AgentRole => typeof role === "string" && allowed.has(role as AgentRole)))];
}

export function roleTransferPlan(
  agents: ReadonlyArray<{ id?: number; roleAssignments?: AgentRole[] }>,
  targetId: number,
  assigned: AgentRole[],
): Array<{ id: number; roleAssignments: AgentRole[] }> {
  const requested = new Set(normalizeAgentRoles(assigned));
  return agents.flatMap((agent) => {
    if (agent.id === undefined || agent.id === targetId) return [];
    const before = normalizeAgentRoles(agent.roleAssignments);
    const after = before.filter((role) => !requested.has(role));
    return after.length === before.length ? [] : [{ id: agent.id, roleAssignments: after }];
  });
}
