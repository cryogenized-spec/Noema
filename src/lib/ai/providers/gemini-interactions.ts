import type { AgentProvider } from "@/lib/ai/types";
import type { ProviderExecutionPayload } from "@/lib/runtime/types";
import { boundConversation, CONTEXT_LIMITS } from "@/lib/ai/context-budget";

/**
 * Gemini Interactions API adapter. Stateless by default for NOEMA's local-first
 * privacy expectations. We do not persist previous_interaction_id or enable
 * background tasks or server-side tools.
 * https://ai.google.dev/gemini-api/docs/interactions-overview
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1/interactions";
type TextContent = { type?: string; text?: string };
type InteractionStep = { type?: string; content?: TextContent[] };
type Interaction = { status?: string; steps?: InteractionStep[] };
type StreamEvent = { event_type?: string; index?: number; step?: { type?: string }; delta?: TextContent; interaction?: { status?: string } };
const isModel = (model: string) => /^gemini-[a-z0-9.-]{2,72}$/.test(model);

export function buildGeminiInteractionBody(payload: ProviderExecutionPayload, stream: boolean) {
  const input = [
    ...boundConversation(payload.conversation).filter((turn) => turn.role !== "system")
      .map((turn) => ({
        type: turn.role === "assistant" ? "model_output" : "user_input",
        content: [{ type: "text", text: turn.content.slice(0, CONTEXT_LIMITS.maxPromptChars) }],
      })),
    { type: "user_input", content: [{ type: "text", text: payload.prompt.slice(0, CONTEXT_LIMITS.maxPromptChars) }] },
  ];
  const s = payload.generationSettings;
  const config: Record<string, number> = {};
  if (Number.isFinite(s.max_output_tokens))
    config.max_output_tokens = Math.max(128, Math.min(2048, Math.floor(s.max_output_tokens)));
  for (const name of ["temperature", "top_p", "top_k"] as const) {
    if (Number.isFinite(s[name])) config[name] = s[name];
  }
  return {
    model: payload.modelId,
    input,
    system_instruction: payload.systemPrompt.slice(0, CONTEXT_LIMITS.maxSystemChars),
    tools: [],
    stream,
    store: false,
    ...(Object.keys(config).length ? { generation_config: config } : {}),
  };
}

async function request(payload: ProviderExecutionPayload, stream: boolean, signal?: AbortSignal) {
  if (!payload.apiKey || payload.apiKey.length < 5) throw Error("Gemini BYOK key is required.");
  if (payload.baseUrl && !["https://generativelanguage.googleapis.com/v1beta", "https://generativelanguage.googleapis.com/v1"]
      .includes(payload.baseUrl.replace(/\/$/, ""))) throw Error("Untrusted Gemini endpoint.");
  if (!isModel(payload.modelId)) throw Error("Unsupported Gemini model identifier.");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": payload.apiKey },
    body: JSON.stringify(buildGeminiInteractionBody(payload, stream)),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    cache: "no-store",
  });
  if (!response.ok) throw Error("Gemini Interactions request failed (HTTP " + response.status + ").");
  return response;
}

export function extractGeminiText(value: unknown): string {
  if (!value || typeof value !== "object") throw Error("Invalid Gemini interaction.");
  const interaction = value as Interaction;
  if (interaction.status !== "completed" || !Array.isArray(interaction.steps))
    throw Error("Gemini interaction did not complete.");
  const outputs = interaction.steps.filter((step) => step.type === "model_output");
  const latest = outputs[outputs.length - 1];
  const text = latest?.content?.filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text).join("") ?? "";
  if (!text.trim()) throw Error("Gemini interaction returned no text.");
  return text.slice(0, 36000);
}

/** Adapt Gemini step-based SSE to NOEMA's existing Responses-stream UI protocol. */
export async function openGeminiStreamResponse(payload: ProviderExecutionPayload, signal?: AbortSignal): Promise<Response> {
  const aborted = new AbortController();
  const response = await request(payload, true, signal ? AbortSignal.any([signal, aborted.signal]) : aborted.signal);
  if (!response.body) throw Error("Gemini Interactions stream is missing.");
  const source = response.body;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      const decoder = new TextDecoder();
      const steps = new Map<number, string>();
      let buffer = "", total = 0, complete = false;
      const send = (type: string, delta?: string) =>
        controller.enqueue(encoder.encode("data: " + JSON.stringify({ type, ...(delta !== undefined ? { delta } : {}) }) + "\n\n"));
      const consume = (frame: string) => {
        if (frame.length > 100000) throw Error("Gemini SSE frame too large.");
        const raw = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart()).join("\n");
        if (!raw || raw === "[DONE]") return;
        let evt: StreamEvent;
        try { evt = JSON.parse(raw) as StreamEvent; }
        catch { throw Error("Malformed Gemini SSE frame."); }
        if (evt.event_type === "step.start" && typeof evt.index === "number")
          steps.set(evt.index, evt.step?.type ?? "");
        if (evt.event_type === "step.delta" && evt.delta?.type === "text" &&
            typeof evt.delta.text === "string" && typeof evt.index === "number" &&
            steps.get(evt.index) === "model_output") {
          total += evt.delta.text.length;
          if (total > 36000) throw Error("Gemini response exceeded output budget.");
          send("response.output_text.delta", evt.delta.text);
        }
        if (evt.event_type === "interaction.completed") complete = true;
        if (evt.event_type === "interaction.failed" || evt.event_type === "interaction.cancelled" ||
            evt.event_type === "interaction.incomplete") throw Error("Gemini interaction failed or was incomplete.");
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.search(/\r?\n\r?\n/);
          while (boundary >= 0) {
            const delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
            consume(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + delimiter);
            boundary = buffer.search(/\r?\n\r?\n/);
          }
          if (buffer.length > 100000) throw Error("Gemini SSE frame too large.");
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        if (!complete || !total) throw Error("Gemini stream ended without a complete reply.");
        send("response.completed");
      } catch {
        aborted.abort();
        // Do not leak server errors, keys, prompts, or provider response bodies.
        try { send("response.failed"); } catch { /* Client disconnected. */ }
        try { await reader.cancel(); } catch { /* Ignore cancellation errors. */ }
      } finally {
        reader.releaseLock();
        try { controller.close(); } catch { /* Client disconnected. */ }
      }
    },
    cancel() { aborted.abort(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" },
  });
}

export const geminiInteractionsProvider: AgentProvider = {
  name: "gemini",
  async generateResponse(payload) {
    const response = await request(payload, false);
    return extractGeminiText(await response.json() as unknown);
  },
};
