import { NextResponse } from "next/server";
import { getSttProvider } from "@/lib/stt/provider-registry";
import type { OpenAiTranscriptionModel } from "@/types/stt";
import { isLocalDevelopmentGatewayRequest } from "@/lib/security/development-gateway";

export const runtime = "nodejs";
const error = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
const isOpenAiModel = (value: string): value is OpenAiTranscriptionModel =>
  value === "gpt-4o-mini-transcribe" || value === "gpt-4o-transcribe";

export async function POST(request: Request) {
  if (!isLocalDevelopmentGatewayRequest(request))
    return error(503, "MISSING_PROVIDER_CONFIGURATION", "STT is disabled without a controlled BYOK development gateway.");
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 12_000_000)
    return error(413, "INVALID_AUDIO", "Voice recording exceeds upload limit.");
  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return error(400, "INVALID_AUDIO", "Malformed audio upload."); }
  if (formData.get("provider") !== "openai")
    return error(501, "PROVIDER_NOT_IMPLEMENTED", "Only OpenAI BYOK transcription is implemented.");
  const apiKey = formData.get("apiKey");
  if (typeof apiKey !== "string" || apiKey.length < 5 || apiKey.length > 256)
    return error(401, "MISSING_PROVIDER_CONFIGURATION", "Unlock API Lockbox to transcribe.");
  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > 10_000_000)
    return error(400, "INVALID_AUDIO", "Recording is missing or too large.");
  const model = String(formData.get("openaiModel") ?? "gpt-4o-mini-transcribe");
  const language = String(formData.get("language") ?? "").slice(0, 10);
  const adapter = getSttProvider("openai");
  if (!adapter) return error(501, "PROVIDER_NOT_IMPLEMENTED", "Transcription adapter unavailable.");
  const result = await adapter.transcribe({
    provider: "openai",
    apiKey,
    audio,
    openaiModel: isOpenAiModel(model) ? model : "gpt-4o-mini-transcribe",
    language: language || undefined,
  });
  if (!result.ok) {
    const code = result.error.code;
    return error(code === "TRANSCRIPTION_TIMEOUT" ? 504 : 502, code, result.error.message);
  }
  return NextResponse.json({ text: result.text }, { headers: { "Cache-Control": "no-store" } });
}
