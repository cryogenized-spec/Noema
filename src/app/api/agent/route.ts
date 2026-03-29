import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/ai/provider-registry";
import { executeAgentPayload } from "@/lib/runtime/execute-agent";
import type { ProviderExecutionPayload } from "@/lib/runtime/types";
import type { AgentRequestPayload, AgentResponsePayload } from "@/types/chat";

const toMode = (action?: string): ProviderExecutionPayload["mode"] => {
  switch (action) {
    case "summarize":
      return "summarize_message";
    case "explain_code":
      return "explain_message";
    case "analyze":
    case "ask_agent":
      return "long_press_ask";
    default:
      return "direct_chat";
  }
};

const buildLegacyPayload = (prompt: string, action?: string): ProviderExecutionPayload => ({
  providerId: process.env.AGENT_PROVIDER?.toLowerCase() ?? "mock",
  modelId: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  mode: toMode(action),
  outputMode: "public",
  invocation: {
    threadId: "legacy-default",
    agentId: -1,
    mode: toMode(action),
    outputMode: "public",
    sourceMessageContent: prompt,
  },
  streamingMode: "oneshot",
  systemPrompt: "You are Noema Agent. Be concise, practical, calm, and action-oriented for power users.",
  prompt,
  conversation: [],
  generationSettings: {},
});

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AgentRequestPayload & { executionPayload?: ProviderExecutionPayload };
    const prompt = payload.prompt?.trim();

    if (!prompt && !payload.executionPayload) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const executionPayload = payload.executionPayload ?? buildLegacyPayload(prompt ?? "", payload.context?.action);

    const result = await executeAgentPayload(executionPayload);

    if (!result.ok) {
      return NextResponse.json(
        {
          content: "I ran into an issue while generating a response. Please try again.",
          provider: result.provider,
          error: result.error,
        },
        { status: 500 },
      );
    }

    const response: AgentResponsePayload = {
      content: result.content ?? "I could not generate a response.",
      provider: result.provider,
    };

    return NextResponse.json(response);
  } catch (error) {
    const provider = resolveProvider().name;
    return NextResponse.json(
      {
        content: "I ran into an issue while generating a response. Please try again.",
        provider,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
