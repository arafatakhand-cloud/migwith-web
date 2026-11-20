"use client";

import { useEffect, useRef, useState } from "react";
import { blogCall } from "../../lib/feed";

// =============================================================================
// 🎙 🔗 Feed phase 3 (miglife 2026-11), same as the app (BlogVoice.kt):
//   MicButton  — tap to record (up to 60 s), tap again to stop → the clip
//   uploadVoice — the clip → the server (blog "uploadAudio") → its link
//   VoicePlayer — ▶ + bars + 0:42 (one clip plays at a time)
//   LinkCard   — the first link in a Mig as a card; YouTube plays right here
// =============================================================================

export const voiceTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, "0")}`;

export async function uploadVoice(blob: Blob): Promise<string> {
  const b64 = await new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => bad(r.error);
    r.readAsDataURL(blob);
  });
  const type = (blob.type || "audio/webm").split(";")[0];
  const r = (await blogCall("uploadAudio", { contentType: type, fileBase64: b64 })) as { url?: string };
  if (!r.url) throw new Error("The voice clip didn't upload.");
  return r.url;
}

export function MicButton({ onClip, disabled = false }: { onClip: (blob: Blob, seconds: number) => void; disabled?: boolean }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const started = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const cb = useRef(onClip);
  cb.current = onClip;
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSecs(s);
      if (s >= 60 && rec.state === "recording") rec.stop();
    }, 250);
    return () => window.clearInterval(t);
  }, [rec]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || "";
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const s = Math.min(60, Math.round((Date.now() - started.current) / 1000));
        setRec(null);
        const blob = new Blob(chunks.current, { type: (r.mimeType || "audio/webm").split(";")[0] });
        if (s >= 1 && blob.size > 0) cb.current(blob, s);
      };
      started.current = Date.now();
      setSecs(0);
      r.start();
      setRec(r);
    } catch {
      alert("Allow the microphone to record a voice clip.");
    }
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (rec ? rec.stop() : void start())}
      aria-label={rec ? "Stop recording" : "Record a voice clip"}
      title={rec ? "Stop" : "Voice"}
      className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[16px] font-black transition active:scale-95 disabled:opacity-40 ${rec ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#EEF2FF]"}`}
    >
      {rec ? (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#DC2626]" />
          <span className="text-[13px]">{voiceTime(secs)} ■</span>
        </>
      ) : (
        "🎙"
      )}
    </button>
  );
}

// one clip plays at a time
let nowPlaying: HTMLAudioElement | null = null;

export function VoicePlayer({ src, seconds, compact = false }: { src: string; seconds: number; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = useRef<number[]>([]);
  if (!bars.current.length) {
    let h = 0;
    for (const ch of src) h = (h * 31 + ch.charCodeAt(0)) | 0;
    bars.current = Array.from({ length: compact ? 14 : 26 }, () => {
      h = (h * 1103515245 + 12345) | 0;
      return 0.25 + (((h >>> 16) & 255) / 255) * 0.75;
    });
  }
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audio.current) {
      const a = new Audio(src);
      a.ontimeupdate = () => a.duration && setProgress(a.currentTime / a.duration);
      a.onended = () => (setPlaying(false), setProgress(0));
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      audio.current = a;
    }
    const a = audio.current;
    if (a.paused) {
      if (nowPlaying && nowPlaying !== a) nowPlaying.pause();
      nowPlaying = a;
      void a.play().catch(() => {});
    } else a.pause();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center gap-2 rounded-full bg-gradient-to-r from-[#EEF2FF] to-[#FDF2F8] text-left ${compact ? "px-2 py-1" : "w-full px-2.5 py-2"}`}
    >
      <span className={`grid shrink-0 place-items-center rounded-full bg-[#6366F1] font-black text-white ${compact ? "h-6 w-6 text-[10px]" : "h-[34px] w-[34px] text-[13px]"}`}>{playing ? "❚❚" : "▶"}</span>
      <span className={`flex items-center gap-[2px] ${compact ? "" : "flex-1"}`}>
        {bars.current.map((b, i) => (
          <i
            key={i}
            className="block w-[3px] rounded-sm"
            style={{ height: `${(compact ? 16 : 28) * b}px`, background: playing && i / bars.current.length <= progress ? "#6366F1" : "#B9A7F5" }}
          />
        ))}
      </span>
      <span className={`shrink-0 font-bold text-[#6B6F9A] ${compact ? "text-[11px]" : "text-[12px]"}`}>
        {compact ? "🎙 " : ""}
        {voiceTime(Math.max(1, seconds))}
      </span>
    </button>
  );
}

// 🔗 link previews, asked once per link per visit
type Preview = { url: string; title: string; image: string; site: string; description?: string; youtube?: string };
const previews = new Map<string, Preview | null>();
const waiting = new Map<string, Promise<Preview | null>>();
const URL_RE = /https?:\/\/[^\s<>"']+/i;
export const firstLink = (text: string) => URL_RE.exec(text || "")?.[0]?.replace(/[.,)!?]+$/, "") || "";

export function LinkCard({ url }: { url: string }) {
  const [pv, setPv] = useState<Preview | null | undefined>(() => previews.get(url));
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (previews.has(url)) return setPv(previews.get(url));
    let p = waiting.get(url);
    if (!p) {
      p = blogCall("linkPreview", { url })
        .then((r) => ((r as { preview?: Preview }).preview || null) as Preview | null)
        .catch(() => null)
        .then((v) => (previews.set(url, v), v));
      waiting.set(url, p);
    }
    let alive = true;
    void p.then((v) => alive && setPv(v));
    return () => {
      alive = false;
    };
  }, [url]);
  if (!pv) return null;
  return (
    <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-2xl border border-[#E3E8F2] bg-white">
      {pv.youtube && play ? (
        <iframe
          title={pv.title || "YouTube"}
          src={`https://www.youtube-nocookie.com/embed/${pv.youtube}?autoplay=1&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => (pv.youtube ? setPlay(true) : window.open(pv.url, "_blank", "noopener,noreferrer"))}
          className="block w-full text-left"
        >
          {pv.image && (
            <span className="relative block aspect-video w-full bg-[#E6EAF4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pv.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              {pv.youtube && <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-[22px] text-white">▶</span>}
            </span>
          )}
          <span className="block bg-[#F6F8FC] px-3 py-2">
            <span className="line-clamp-2 block text-[13.5px] font-extrabold text-[#1E1B4B]">{pv.title || pv.url}</span>
            <span className="block truncate text-[11.5px] text-[#7A86A3]">
              {pv.site || "Link"}
              {pv.youtube ? " · plays right here" : ""}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
