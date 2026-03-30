"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useSttStore } from "@/store/stt-store";
import type { SttError } from "@/types/stt";

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

interface VoiceCaptureButtonProps {
  onTranscript: (text: string) => void;
  onError?: (error: SttError) => void;
  className?: string;
  compact?: boolean;
}

export function VoiceCaptureButton({ onTranscript, onError, className = "", compact = false }: VoiceCaptureButtonProps) {
  const { provider, openaiModel, language, rememberLastProvider, hydrate, hydrated } = useSttStore();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const preferredMimeType = useMemo(() => PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)), []);

  const emitError = (error: SttError) => {
    onError?.(error);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      emitError({ code: "RECORDER_UNSUPPORTED", message: "This browser does not support manual audio recording." });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setElapsedSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((current) => current + 1);
      }, 1000);
    } catch {
      emitError({ code: "MIC_PERMISSION_DENIED", message: "Microphone permission was denied." });
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (timerRef.current) window.clearInterval(timerRef.current);
    setRecording(false);

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mimeType = preferredMimeType ?? "audio/webm";
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    if (!blob.size) {
      emitError({ code: "INVALID_AUDIO", message: "No audio was captured. Try again." });
      return;
    }

    setTranscribing(true);
    try {
      const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `recording.${extension}`, { type: blob.type || "audio/webm" });
      const form = new FormData();
      form.set("provider", rememberLastProvider ? provider : "openai");
      form.set("openaiModel", openaiModel);
      if (language) form.set("language", language);
      form.set("audio", file);

      const response = await fetch("/api/stt/transcribe", { method: "POST", body: form });
      const payload = (await response.json()) as { text?: string; error?: SttError };

      if (!response.ok || !payload.text) {
        emitError(
          payload.error ?? {
            code: "PROVIDER_REQUEST_FAILED",
            message: "Transcription failed.",
          },
        );
        return;
      }

      onTranscript(payload.text);
    } catch (error) {
      emitError({
        code: "PROVIDER_REQUEST_FAILED",
        message: "Transcription request failed.",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTranscribing(false);
    }
  };

  const onPress = () => {
    if (transcribing) return;
    if (recording) {
      void stopRecording();
      return;
    }
    void startRecording();
  };

  return (
    <button
      type="button"
      aria-label={recording ? "Stop recording" : "Start recording"}
      onClick={onPress}
      className={`shrink-0 rounded-xl border p-2 transition ${compact ? "px-2 py-1.5 text-xs" : ""} ${
        recording
          ? "border-rose-300/45 bg-rose-500/18 text-rose-100"
          : transcribing
            ? "border-cyan-300/35 bg-cyan-500/15 text-cyan-100"
            : "border-noema-borderSoft bg-slate-900/65 text-slate-300"
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon icon={recording ? "solar:stop-circle-bold" : "solar:microphone-3-bold"} className="text-lg" />
        {recording ? `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}` : transcribing ? "Transcribing…" : compact ? "Speak" : "Voice"}
      </span>
    </button>
  );
}

