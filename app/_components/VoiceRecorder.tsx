"use client";

import { useEffect, useRef, useState } from "react";

// 🎤 Voice message recorder: hold to record up to 60 s (same as the app),
// then send or cancel the clip. The parent uploads the recording.

export const MAX_VOICE_MS = 60_000;

// Formats the browser can record, best match for the app (audio/mp4) first.
const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pickType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Heights of the little bars drawn for a recording waiting to be sent.
const WAVE = [0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.55, 0.8, 0.4, 0.7, 0.95, 0.5, 0.65, 0.3];

export function VoiceRecorder({
  disabled,
  onSend,
  onError,
  onActive,
}: {
  disabled: boolean;
  /** True while recording or while a clip waits, so the parent hides the text box. */
  onActive?: (active: boolean) => void;
  onSend: (audio: Blob) => Promise<void>;
  onError: (message: string) => void;
}) {
  // Like the app: HOLD 🎤 to record, let go to finish. The clip then waits in
  // the chat box with ✕ (cancel) and ➤ (send); nothing is sent by itself.
  const [state, setState] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const pressedAt = useRef(0);
  const began = useRef(0);
  const discard = useRef(false);

  const cleanupStream = () => {
    if (timer.current) clearInterval(timer.current);
    if (stopAt.current) clearTimeout(stopAt.current);
    timer.current = null;
    stopAt.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Stop the mic if the page closes mid-recording; an unsent clip is dropped.
  useEffect(
    () => () => {
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanupStream();
    },
    []
  );

  useEffect(() => {
    onActive?.(state !== "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Let go while the browser was asking for the microphone: don't record.
      if (!holding.current) {
        s.getTracks().forEach((t) => t.stop());
        onError("Hold 🎤 to record.");
        return;
      }
      stream.current = s;
      const type = pickType();
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      r.onstop = () => {
        cleanupStream();
        const secs = Math.min(MAX_VOICE_MS / 1000, Math.max(1, Math.round((Date.now() - began.current) / 1000)));
        const b = new Blob(chunks, { type: (r.mimeType || type || "audio/webm").split(";")[0] });
        if (discard.current || b.size === 0) {
          if (!discard.current) onError("The recording is empty, so nothing was sent.");
          discard.current = false;
          setState("idle");
          return;
        }
        setSeconds(secs);
        setBlob(b);
        setState("review");
      };
      recorder.current = r;
      discard.current = false;
      r.start();
      began.current = Date.now();
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - began.current) / 1000)), 250);
      // Still holding at 60 s: stops by itself and waits in the box.
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

  const pressStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (state === "review" || state === "sending") {
      onError("Send or cancel the recording first.");
      return;
    }
    if (state !== "idle") return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not supported
    }
    holding.current = true;
    pressedAt.current = Date.now();
    start();
  };

  const pressEnd = () => {
    if (!holding.current) return;
    holding.current = false;
    if (recorder.current?.state !== "recording") return;
    // A quick tap is not a recording: drop it and say how it works.
    if (Date.now() - pressedAt.current < 700) {
      discard.current = true;
      onError("Hold 🎤 to record, release to finish.");
    }
    recorder.current.stop();
  };

  const reset = () => {
    setBlob(null);
    setSeconds(0);
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

  const mic = (
    <button
      type="button"
      onPointerDown={pressStart}
      onPointerUp={pressEnd}
      onPointerCancel={pressEnd}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      title="Hold to record a voice message"
      style={{ touchAction: "none", WebkitTouchCallout: "none" }}
      className={`flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full border-[1.5px] text-base disabled:opacity-40 ${
        state === "recording" ? "scale-110 border-red-400 bg-red-500" : "border-[#8C7B3E] bg-[#1E2B47]"
      }`}
    >
      🎤
    </button>
  );

  if (state === "idle") return mic;

  return (
    <>
      {mic}
      {state === "recording" ? (
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border-[1.5px] border-red-300 bg-white px-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className={`text-sm font-bold ${seconds >= MAX_VOICE_MS / 1000 - 10 ? "text-amber-600" : "text-[#0B2A5B]"}`}>
            {clock(seconds)} / {clock(MAX_VOICE_MS / 1000)}
          </span>
          <span className="ml-auto truncate text-xs text-[#7A8599]">Release to finish</span>
        </div>
      ) : (
        <>
          {/* The finished clip waits right in the chat box. */}
          <div className="flex h-9 min-w-0 flex-1 items-center rounded-full border border-[#E2B93B]/45 bg-gradient-to-r from-[#0B2A5B] to-[#1E6FD9] pl-1 pr-3">
            <button
              type="button"
              onClick={reset}
              disabled={state === "sending"}
              aria-label="Cancel recording"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/90 text-sm font-bold text-white disabled:opacity-40"
            >
              ✕
            </button>
            <span className="ml-2 text-[13px]">🎤</span>
            <div className="ml-1.5 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
              {WAVE.map((h, i) => (
                <span key={i} className="w-0.5 shrink-0 rounded-sm bg-[#E2B93B]/80" style={{ height: `${h * 18}px` }} />
              ))}
            </div>
            <span className="text-xs font-bold text-white">{seconds}s</span>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            aria-label="Send voice message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg text-[#32A852] shadow-md disabled:opacity-50"
          >
            {state === "sending" ? "⏳" : "➤"}
          </button>
        </>
      )}
    </>
  );
}
