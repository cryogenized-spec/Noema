import type { OpenAiTranscriptionModel, SttError, SttProviderId } from "@/types/stt";

export interface SttTranscriptionRequest {
  provider: SttProviderId;
  audio: File;
  openaiModel?: OpenAiTranscriptionModel;
  language?: string;
}

export interface SttTranscriptionSuccess {
  ok: true;
  text: string;
}

export interface SttTranscriptionFailure {
  ok: false;
  error: SttError;
}

export type SttTranscriptionResult = SttTranscriptionSuccess | SttTranscriptionFailure;

export interface SttProviderAdapter {
  providerId: SttProviderId;
  transcribe: (request: SttTranscriptionRequest) => Promise<SttTranscriptionResult>;
}

