import { resolveProvider } from "@/lib/ai/provider-registry";
import type { AgentExecutionResult, ProviderExecutionPayload } from "@/lib/runtime/types";

export async function executeAgentPayload(payload: ProviderExecutionPayload): Promise<AgentExecutionResult> {
  try {
    const provider = resolveProvider(payload.providerId);
    const content = await provider.generateResponse(payload);
    return {
      ok: true,
      provider: provider.name,
      content,
    };
  } catch (error) {
    return {
      ok: false,
      provider: payload.providerId,
      error: {
        ok: false,
        code: "PROVIDER_REQUEST_FAILED",
        message: "Provider request failed.",
        detail: error instanceof Error ? error.message : "Unknown provider error",
      },
    };
  }
}
