/** REST Responses JSON contains output[] items; output_text is not always provided. */
export function extractOpenAIText(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Invalid OpenAI response body.");
  const data = value as { output_text?: unknown; output?: unknown };
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  if (!Array.isArray(data.output)) throw new Error("OpenAI returned no text output.");
  const texts: string[] = [];
  for (const item of data.output) {
    if (!item || typeof item !== "object") continue;
    const message = item as { type?: unknown; content?: unknown };
    if (message.type !== "message" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string") texts.push(p.text);
    }
  }
  const result = texts.join("");
  if (!result.trim()) throw new Error("OpenAI returned no text; unsupported tool output or refusal.");
  return result;
}
