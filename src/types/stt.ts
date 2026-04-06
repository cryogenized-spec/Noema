export type SttProviderId = "openai" | "google_cloud" | "android_native";
export type OpenAiTranscriptionModel = "gpt-4o-mini-transcribe" | "gpt-4o-transcribe";

export interface SttPreferences {
  provider: SttProviderId;
  openaiModel: OpenAiTranscriptionModel;
  language?: string;
  rememberLastProvider: boolean;
}

export interface SttError {
  code:
    | "MIC_PERMISSION_DENIED"
    | "RECORDER_UNSUPPORTED"
    | "MISSING_PROVIDER_CONFIGURATION"
    | "PROVIDER_REQUEST_FAILED"
    | "INVALID_AUDIO"
    | "TRANSCRIPTION_TIMEOUT"
    | "PROVIDER_NOT_IMPLEMENTED";
  message: string;
  detail?: string;
}

