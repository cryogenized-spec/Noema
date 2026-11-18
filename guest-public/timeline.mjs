/**
 * Keep an asynchronous result tied to the conversation that requested it.
 * Selecting a different thread invalidates all outstanding timeline results.
 * A newer load of the same thread also supersedes older requests.
 */
export function createTimelineGuard() {
  let selected = "";
  let serial = 0;
  return {
    select(threadId) {
      if (selected !== threadId) {
        selected = threadId;
        serial++;
      }
    },
    begin(threadId) {
      const ticket = ++serial;
      return () => selected === threadId && serial === ticket;
    },
  };
}

/** Drafts are tab-local, never shared across different conversations. */
export function createDraftBuffer() {
  const values = new Map();
  return {
    get(threadId) { return values.get(threadId) ?? ""; },
    set(threadId, value) { if (threadId) values.set(threadId, value); },
    clearIfUnchanged(threadId, submittedText) {
      const latest = values.get(threadId) ?? submittedText;
      if (latest.trim() !== submittedText.trim()) return false;
      values.set(threadId, "");
      return true;
    },
  };
}
