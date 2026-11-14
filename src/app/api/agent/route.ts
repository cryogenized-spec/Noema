import { NextResponse } from "next/server";
import { executeAgentPayload } from "@/lib/runtime/execute-agent";
import { openAIStreamResponse } from "@/lib/ai/providers/openai-provider";
import { CONTEXT_LIMITS, boundConversation } from "@/lib/ai/context-budget";
import type { ProviderExecutionPayload } from "@/lib/runtime/types";

export const runtime = "nodejs";
const reject = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  // A public unauthenticated relay is not an acceptable production deployment.
  // Explicitly opt into local development only; future messaging uses device authentication.
  if (process.env.NOEMA_ENABLE_BYOK_AGENT_PROXY !== "true")
    return reject(503, "Agent proxy disabled until authenticated sessions are available.");
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).host !== new URL(request.url).host) return reject(403, "Cross-origin request blocked."); }
    catch { return reject(403, "Invalid origin."); }
  }
  let raw: string;
  try { raw = await request.text(); } catch { return reject(400, "Unreadable payload."); }
  if (raw.length > 60000) return reject(413, "Prompt payload exceeds fixed budget.");
  let payload: ProviderExecutionPayload;
  try {
    const parsed = JSON.parse(raw) as { executionPayload?: ProviderExecutionPayload };
    if (!parsed.executionPayload || typeof parsed.executionPayload !== "object") return reject(400, "Execution payload required.");
    payload = parsed.executionPayload;
  } catch { return reject(400, "Invalid JSON."); }
  if (payload.providerId !== "openai") return reject(400, "Only OpenAI BYOK is available in this development gateway.");
  if (typeof payload.apiKey !== "string" || payload.apiKey.length < 5 || payload.apiKey.length > 256)
    return reject(401, "An explicitly supplied BYOK key is required.");
  if (typeof payload.modelId !== "string" || typeof payload.prompt !== "string" || typeof payload.systemPrompt !== "string")
    return reject(400, "Invalid request fields.");
  if (!Array.isArray(payload.conversation) || payload.conversation.length > 100 ||
      payload.conversation.some((t) => !t || typeof t.content !== "string" || typeof t.role !== "string"))
    return reject(400, "Invalid conversation.");
  if (!payload.generationSettings || typeof payload.generationSettings !== "object")
    return reject(400, "Invalid generation settings.");
  if (payload.prompt.length > CONTEXT_LIMITS.maxPromptChars * 2) return reject(413, "Prompt is too large.");
  payload = {
    ...payload,
    conversation: boundConversation(payload.conversation),
    prompt: payload.prompt.slice(0, CONTEXT_LIMITS.maxPromptChars),
    systemPrompt: payload.systemPrompt.slice(0, CONTEXT_LIMITS.maxSystemChars),
  };
  try {
    if (payload.streamingMode !== "oneshot") {
      const upstream = await openAIStreamResponse(payload);
      return new Response(upstream.body, {
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" },
      });
    }
    const result = await executeAgentPayload(payload);
    if (!result.ok) return reject(502, result.error?.message ?? "Provider request failed.");
    return NextResponse.json({ content: result.content, provider: result.provider }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return reject(502, "Provider request failed. Check your model, key, and network connection.");
  }
}
