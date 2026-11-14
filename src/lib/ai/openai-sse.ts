/** Consume actual Responses SSE output_text.delta events, not simulated typing. */
export async function readOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onText: (assembled: string) => Promise<void>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let completed = false;
  const consume = async (block: string) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let event: { type?: string; delta?: unknown; error?: unknown };
    try { event = JSON.parse(data) as typeof event; } catch { throw new Error("Malformed Responses stream event."); }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      if (assembled.length + event.delta.length > 36000) throw new Error("Response exceeded stream budget.");
      assembled += event.delta;
      await onText(assembled);
    }
    if (event.type === "response.completed") completed = true;
    if (event.type === "error" || event.type === "response.failed" || event.type === "response.incomplete") {
      throw new Error("OpenAI stream did not finish successfully.");
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 100000) throw new Error("SSE frame too large.");
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
        const width = match?.[0].length ?? 2;
        await consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + width);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
    if (buffer.trim()) await consume(buffer);
    if (!completed || !assembled.trim()) throw new Error("Incomplete or empty OpenAI stream.");
    return assembled;
  } finally {
    reader.releaseLock();
  }
}
