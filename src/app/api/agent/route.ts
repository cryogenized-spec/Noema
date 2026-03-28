import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/ai/provider-registry";
import type { AgentRequestPayload, AgentResponsePayload } from "@/types/chat";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AgentRequestPayload;
    const prompt = payload.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const provider = resolveProvider();
    const content = await provider.generateResponse(prompt, payload.context);

    const response: AgentResponsePayload = {
      content,
      provider: provider.name,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        content: "I ran into an issue while generating a response. Please try again.",
        provider: "fallback",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
