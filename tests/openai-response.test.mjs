import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOpenAIText } from "../src/lib/ai/openai-response.ts";
test("parses REST output items (not only SDK output_text)", () => {
  assert.equal(extractOpenAIText({ output: [
    { type: "reasoning", summary: [] },
    { type: "message", content: [{ type: "output_text", text: "Hello" }, { type: "output_text", text: " world" }] },
  ] }), "Hello world");
  assert.equal(extractOpenAIText({ output_text: "Hi" }), "Hi");
  assert.throws(() => extractOpenAIText({ output: [{ type: "function_call", arguments: "{}" }] }));
});
