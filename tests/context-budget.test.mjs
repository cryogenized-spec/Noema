import { test } from "node:test";
import assert from "node:assert/strict";
import { boundConversation, boundedToolResult, CONTEXT_LIMITS, shouldRetryLookup } from "../src/lib/ai/context-budget.ts";
test("conversation cannot flood context even if history is enormous", () => {
  const turns = Array.from({ length: 120 }, (_, i) => ({ role: "user", content: "x".repeat(100000) + i }));
  const result = boundConversation(turns);
  assert.ok(result.length <= CONTEXT_LIMITS.maxHistoryTurns);
  assert.ok(result.every((turn) => turn.content.length <= CONTEXT_LIMITS.maxTurnChars));
  assert.ok(result.reduce((sum, t) => sum + t.content.length, 0) <= CONTEXT_LIMITS.maxHistoryChars);
});
test("tool output and failed lookup retry budgets", () => {
  assert.equal(boundedToolResult("x".repeat(20000)).truncated, true);
  assert.equal(shouldRetryLookup(2, "typoed-file"), false);
  assert.equal(shouldRetryLookup(1, "typoed-file"), true);
});
