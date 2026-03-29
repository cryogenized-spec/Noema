import type { SttProviderAdapter } from "@/lib/stt/types";

export const androidNativeSttProvider: SttProviderAdapter = {
  providerId: "android_native",
  async transcribe() {
    return {
      ok: false,
      error: {
        code: "PROVIDER_NOT_IMPLEMENTED",
        message: "Android native speech provider is not available in web/PWA runtime.",
        detail: "Reserved for future native-wrapper integration using Android SpeechRecognizer.",
      },
    };
  },
};

