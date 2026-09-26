"use client";

import { useEffect, useRef, useState } from "react";

// 🎤 Voice message recorder: record up to 60 s (same limit as the app),
// listen back, then send or cancel. The parent uploads the recording.

export const MAX_VOICE_MS = 60_000;

// Formats the browser can record, best match for the app (audio/mp4) first.
const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pickType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function VoiceRecorder({
  disabled,
  onSend,
  onError,
  onActive,
}: {
  disabled: boolean;
  /** True while recording or reviewing, so the parent can hide the text box. */
  onActive?: (active: boolean) => void;
  onSend: (audio: Blob) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupStream = () => {
    if (timer.current) clearInterval(timer.current);
    if (stopAt.current) clearTimeout(stopAt.current);
    timer.current = null;
    stopAt.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Stop the mic if the page closes mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanupStream();
    },
    []
  );

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  useEffect(() => {
    onActive?.(state !== "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = async () => {
    if (disabled || state !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const type = pickType();
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      r.onstop = () => {
        cleanupStream();
        const b = new Blob(chunks, { type: (r.mimeType || type || "audio/webm").split(";")[0] });
        if (b.size === 0) {
          onError("The recording is empty, so nothing was sent.");
          setState("idle");
          return;
        }
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState("review");
      };
      recorder.current = r;
      r.start();
      setSeconds(0);
      setState("recording");
      const began = Date.now();
      timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 250);
      stopAt.current = setTimeout(() => r.state === "recording" && r.stop(), MAX_VOICE_MS);
    } catch (err: any) {
      cleanupStream();
      onError(
        err?.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in your browser to send voice messages."
          : "Could not start the microphone."
      );
    }
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const reset = () => {
    setBlob(null);
    setUrl("");
    setState("idle");
  };

  const send = async () => {
    if (!blob) return;
    setState("sending");
    try {
      await onSend(blob);
      reset();
    } catch (err: any) {
      onError(err?.message || "Voice message could not be sent.");
      setState("review");
    }
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        title="Record a voice message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#8C7B3E] bg-[#1E2B47] text-lg disabled:opacity-40"
      >
        🎤
      </button>
    );
  }

  // Recording / review take over the composer row.
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5">
      {state === "recording" ? (
        <>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className={`text-sm font-bold ${seconds >= MAX_VOICE_MS / 1000 - 10 ? "text-amber-600" : "text-[#0B2A5B]"}`}>
            {clock(seconds)} / {clock(MAX_VOICE_MS / 1000)}
          </span>
          <button
            type="button"
            onClick={stop}
            className="ml-auto rounded-lg bg-red-500 px-3 py-1.5 text-sm font-bold text-white"
          >
            ■ Stop
          </button>
        </>
      ) : (
        <>
          <audio controls src={url} className="h-9 min-w-0 flex-1" />
          <button
            type="button"
            onClick={reset}
            disabled={state === "sending"}
            className="rounded-lg border border-[#D5E3F5] px-2.5 py-1.5 text-sm text-[#5B6B8C] disabled:opacity-40"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className="rounded-lg bg-[#2F80ED] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send"}
          </button>
        </>
      )}
    </div>
  );
}
