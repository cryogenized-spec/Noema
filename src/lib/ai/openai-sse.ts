/** Parse real Responses SSE frames. Transport reads may contain many frames. */
export async function readOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onText: (assembled: string) => Promise<void>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let completed = false;
  const consume = async (frame: string) => {
    if (frame.length > 100000) throw Error("SSE frame too large.");
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let event: { type?: string; delta?: unknown };
    try { event = JSON.parse(data) as typeof event; }
    catch { throw Error("Malformed Responses stream event."); }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      if (assembled.length + event.delta.length > 36000)
        throw Error("Response exceeded stream budget.");
      assembled += event.delta;
      await onText(assembled);
    }
    if (event.type === "response.completed") completed = true;
    if (event.type === "error" || event.type === "response.failed" ||
        event.type === "response.incomplete")
      throw Error("OpenAI stream failed or was incomplete.");
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream:true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
        await consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + delimiter);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      // Only *uncompleted frame* size matters; a transport chunk is arbitrary.
      if (buffer.length > 100000) throw Error("SSE frame too large.");
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consume(buffer);
    if (!completed || !assembled.trim()) throw Error("Incomplete or empty OpenAI stream.");
    return assembled;
  } catch (error) {
    // Failure must abort upstream generation, not merely release the reader lock.
    try { await reader.cancel(error); } catch { /* Prefer original failure. */ }
    throw error;
  } finally { reader.releaseLock(); }
}
