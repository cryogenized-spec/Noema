import type { AgentInvocationMode, AgentOutputMode } from "@/lib/runtime/types";

export type ConversationTransport = "local" | "remote_peer";

export type ConversationParticipantRole = "self" | "peer" | "agent" | "system";

export interface ConversationParticipant {
  id: string;
  role: ConversationParticipantRole;
  displayName?: string;
  isLocal: boolean;
}

export interface MessageInvocationMetadata {
  invocationId?: string;
  agentId?: number;
  mode?: AgentInvocationMode;
  outputMode?: AgentOutputMode;
  targetMessageId?: number;
}

export type ConversationMessageKind = "user" | "agent" | "system" | "draft";

export interface ConversationMessageDelivery {
  state?: "local_only" | "pending_sync" | "sent" | "delivered" | "read";
  remoteMessageId?: string;
  updatedAt?: string;
}

export interface ConversationMessageAuthor {
  participantId: string;
  isLocal: boolean;
  transport: ConversationTransport;
}

export interface ConversationThreadSyncState {
  status: "local_only" | "sync_pending" | "synced";
  lastSyncAt?: string;
  lastEventCursor?: string;
}

export interface ConversationThread {
  id?: number;
  threadKey: string;
  title: string;
  participants: ConversationParticipant[];
  selectedAgentId: number | null;
  transportHint: ConversationTransport;
  syncState: ConversationThreadSyncState;
  createdAt: string;
  updatedAt: string;
}
