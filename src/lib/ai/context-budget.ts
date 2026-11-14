/** Conservative character limits; these are guardrails, not token-accurate billing. */
export const CONTEXT_LIMITS = Object.freeze({
  maxHistoryTurns: 8,
  maxHistoryChars: 20000,
  maxTurnChars: 3500,
  maxPromptChars: 8000,
  maxSystemChars: 12000,
  maxToolCallsPerTurn: 6,
  maxToolResultChars: 6000,
  maxTotalToolResultChars: 18000,
  maxFailedLookups: 2,
});
export function boundConversation<T extends { role: string; content: string }>(turns: T[]): T[] {
  const result: T[] = [];
  let used = 0;
  for (const turn of turns.slice(-CONTEXT_LIMITS.maxHistoryTurns).reverse()) {
    if (typeof turn.content !== "string" || !["assistant", "user", "system"].includes(turn.role)) continue;
    const allowed = Math.min(CONTEXT_LIMITS.maxTurnChars, CONTEXT_LIMITS.maxHistoryChars - used);
    if (allowed <= 0) break;
    const content = turn.content.slice(-allowed);
    result.push({ ...turn, content });
    used += content.length;
  }
  return result.reverse();
}
export function boundedToolResult(text: string): { content: string; truncated: boolean } {
  if (text.length <= CONTEXT_LIMITS.maxToolResultChars) return { content: text, truncated: false };
  return { content: text.slice(0, CONTEXT_LIMITS.maxToolResultChars) + "\n[Result truncated: narrow your query]", truncated: true };
}
export function shouldRetryLookup(failedAttempts: number, query: string): boolean {
  return failedAttempts < CONTEXT_LIMITS.maxFailedLookups && query.trim().length > 1;
}
