import type { SttProviderAdapter } from "@/lib/stt/types";

export const googleCloudSttProvider: SttProviderAdapter = {
  providerId: "google_cloud",
  async transcribe() {
    return {
      ok: false,
      error: {
        code: "PROVIDER_NOT_IMPLEMENTED",
        message: "Google Cloud Speech-to-Text adapter is a placeholder in this phase.",
        detail: "Provider wiring entry exists; full credential and endpoint implementation is deferred.",
      },
    };
  },
};

