import { androidNativeSttProvider } from "@/lib/stt/providers/android-native-stt";
import { googleCloudSttProvider } from "@/lib/stt/providers/google-cloud-stt";
import { openAiSttProvider } from "@/lib/stt/providers/openai-stt";
import type { SttProviderAdapter } from "@/lib/stt/types";
import type { SttProviderId } from "@/types/stt";

const providers: Record<SttProviderId, SttProviderAdapter> = {
  openai: openAiSttProvider,
  google_cloud: googleCloudSttProvider,
  android_native: androidNativeSttProvider,
};

export const getSttProvider = (provider: SttProviderId) => providers[provider] ?? null;

