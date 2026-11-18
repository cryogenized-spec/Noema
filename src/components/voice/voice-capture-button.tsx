"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useSttStore } from "@/store/stt-store";
import { useLockboxStore } from "@/store/lockbox-store";
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
  const revealKey = useLockboxStore((state) => state.revealKey);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const mounted = useRef(false);
  const captureGeneration = useRef(0);
  const transcriptionController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++captureGeneration.current;
      transcriptionController.current?.abort();
      transcriptionController.current = null;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      try {
        if (mediaRecorderRef.current?.state === "recording")
          mediaRecorderRef.current.stop();
      } catch { /* Track cleanup must still run. */ }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const preferredMimeType = useMemo(() => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return undefined;
    return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  }, []);

  const emitError = (error: SttError) => {
    onError?.(error);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      emitError({ code: "RECORDER_UNSUPPORTED", message: "This browser does not support manual audio recording." });
      return;
    }

    const attempt = ++captureGeneration.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || captureGeneration.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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
      if (mounted.current && captureGeneration.current === attempt)
        emitError({ code: "MIC_PERMISSION_DENIED", message: "Microphone permission was denied." });
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (timerRef.current !== null) window.clearInterval(timerRef.current);
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
    const attempt = captureGeneration.current;
    const controller = new AbortController();
    transcriptionController.current = controller;
    try {
      const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `recording.${extension}`, { type: blob.type || "audio/webm" });
      const form = new FormData();
      form.set("provider", rememberLastProvider ? provider : "openai");
      const apiKey = await revealKey("openai");
      if (!mounted.current || captureGeneration.current !== attempt || controller.signal.aborted) return;
      form.set("apiKey", apiKey);
      form.set("openaiModel", openaiModel);
      if (language) form.set("language", language);
      form.set("audio", file);

      const response = await fetch("/api/stt/transcribe", {
        method: "POST", body: form, signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
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

      if (mounted.current) onTranscript(payload.text);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      emitError({
        code: "PROVIDER_REQUEST_FAILED",
        message: "Transcription request failed.",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (transcriptionController.current === controller) transcriptionController.current = null;
      if (mounted.current) setTranscribing(false);
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
        <span className={compact ? "hidden sm:inline" : ""}>{recording ? `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}` : transcribing ? "Transcribing…" : compact ? "Speak" : "Voice"}</span>
      </span>
    </button>
  );
}
