import { test } from "node:test";
import assert from "node:assert/strict";
import { openAiSttProvider } from "../src/lib/stt/providers/openai-stt.ts";

test("a client disconnect aborts the upstream BYOK transcription request", async () => {
  const originalFetch = globalThis.fetch;
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => {
      void resolve;
      if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
      else signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")), {once:true});
    });
  };
  try {
    const controller = new AbortController();
    const work = openAiSttProvider.transcribe({
      provider:"openai",
      apiKey:"TEST_FAKE_KEY_DO_NOT_USE",
      audio:new File([new Uint8Array([1,2,3])],"example.webm",{type:"audio/webm"}),
      signal:controller.signal,
    });
    assert.ok(signal, "the request reached fetch");
    controller.abort();
    const response = await work;
    assert.equal(signal.aborted,true);
    assert.equal(response.ok,false);
  } finally { globalThis.fetch = originalFetch; }
});
