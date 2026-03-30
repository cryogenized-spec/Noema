import type { AgentInvocationDescriptor, AgentInvocationMode, AgentOutputMode } from "@/lib/runtime/types";

interface InvocationDescriptorInput {
  threadId: string;
  agentId: number;
  mode: AgentInvocationMode;
  outputMode: AgentOutputMode;
  sourceMessageId?: number;
  sourceMessageContent?: string;
}

export const createInvocationDescriptor = (input: InvocationDescriptorInput): AgentInvocationDescriptor => ({
  threadId: input.threadId,
  sourceMessageId: input.sourceMessageId,
  sourceMessageContent: input.sourceMessageContent,
  agentId: input.agentId,
  mode: input.mode,
  outputMode: input.outputMode,
});
