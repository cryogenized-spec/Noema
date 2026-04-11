import type { SttProviderAdapter } from "@/lib/stt/types";

export const openAiSttProvider: SttProviderAdapter = {
  providerId: "openai",
  async transcribe(request) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: "MISSING_PROVIDER_CONFIGURATION",
          message: "OpenAI transcription is not configured on the server.",
          detail: "Set OPENAI_API_KEY in environment variables.",
        },
      };
    }

    if (!request.audio || request.audio.size === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_AUDIO",
          message: "Audio recording is empty.",
        },
      };
    }

    const model = request.openaiModel ?? "gpt-4o-mini-transcribe";
    const formData = new FormData();
    formData.set("file", request.audio, request.audio.name || "recording.webm");
    formData.set("model", model);
    if (request.language) formData.set("language", request.language);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          error: {
            code: "PROVIDER_REQUEST_FAILED",
            message: "OpenAI transcription request failed.",
            detail: errorText.slice(0, 240),
          },
        };
      }

      const payload = (await response.json()) as { text?: string };
      if (!payload.text?.trim()) {
        return {
          ok: false,
          error: { code: "PROVIDER_REQUEST_FAILED", message: "OpenAI returned an empty transcript." },
        };
      }

      return { ok: true, text: payload.text.trim() };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        error: {
          code: isAbort ? "TRANSCRIPTION_TIMEOUT" : "PROVIDER_REQUEST_FAILED",
          message: isAbort ? "Transcription timed out." : "OpenAI transcription failed.",
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

