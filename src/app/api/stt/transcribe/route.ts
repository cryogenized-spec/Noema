import { NextResponse } from "next/server";
import { getSttProvider } from "@/lib/stt/provider-registry";
import type { OpenAiTranscriptionModel, SttProviderId } from "@/types/stt";

const isProvider = (value: string): value is SttProviderId =>
  value === "openai" || value === "google_cloud" || value === "android_native";

const isOpenAiModel = (value: string): value is OpenAiTranscriptionModel =>
  value === "gpt-4o-mini-transcribe" || value === "gpt-4o-transcribe";

export async function POST(request: Request) {
  const formData = await request.formData();
  const providerRaw = String(formData.get("provider") ?? "openai");
  const provider = isProvider(providerRaw) ? providerRaw : "openai";
  const audio = formData.get("audio");
  const modelRaw = String(formData.get("openaiModel") ?? "gpt-4o-mini-transcribe");
  const language = String(formData.get("language") ?? "");

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_AUDIO",
          message: "No audio recording was provided.",
        },
      },
      { status: 400 },
    );
  }

  const adapter = getSttProvider(provider);
  if (!adapter) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_PROVIDER_CONFIGURATION",
          message: `Unsupported STT provider: ${provider}.`,
        },
      },
      { status: 400 },
    );
  }

  const result = await adapter.transcribe({
    provider,
    audio,
    openaiModel: isOpenAiModel(modelRaw) ? modelRaw : "gpt-4o-mini-transcribe",
    language: language || undefined,
  });

  if (!result.ok) {
    const status =
      result.error.code === "INVALID_AUDIO"
        ? 400
        : result.error.code === "MISSING_PROVIDER_CONFIGURATION"
          ? 400
          : result.error.code === "PROVIDER_NOT_IMPLEMENTED"
            ? 501
            : result.error.code === "TRANSCRIPTION_TIMEOUT"
              ? 504
              : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ text: result.text });
}

