import { test } from "node:test";
import assert from "node:assert/strict";
import { readOpenAIStream } from "../src/lib/ai/openai-sse.ts";
test("SSE parser handles split UTF-8 boundaries and delta accumulation", async () => {
  const input = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello"}\n\n' +
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" world"}\n\n' +
    'data: {"type":"response.completed"}\n\n';
  const bytes = new TextEncoder().encode(input);
  const pieces = [bytes.slice(0, 10), bytes.slice(10, 83), bytes.slice(83)];
  const body = new ReadableStream({ start(controller) { for (const p of pieces) controller.enqueue(p); controller.close(); } });
  const received = [];
  assert.equal(await readOpenAIStream(body, async (text) => received.push(text)), "Hello world");
  assert.deepEqual(received, ["Hello", "Hello world"]);
});
test("failed stream is rejected, never shown as success", async () => {
  const b = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"response.failed"}\n\n')); c.close(); } });
  await assert.rejects(() => readOpenAIStream(b, async () => {}));
});
