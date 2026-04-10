import { buildAgentExecutionPayload } from "@/lib/runtime/payload-builder";
import { executeAgentPayload } from "@/lib/runtime/execute-agent";
import type { AgentExecutionRequest, AgentExecutionResult } from "@/lib/runtime/types";

export async function runAgentExecution(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
  const built = buildAgentExecutionPayload(request);

  if (!built.ok) {
    return {
      ok: false,
      provider: request.provider.id,
      error: built,
    };
  }

  return executeAgentPayload(built.payload);
}
