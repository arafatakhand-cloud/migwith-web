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

// 🎵 A Mig's song (Music Library, 2026-11-25): a small pill — tap to play / stop. One song at a time.
let songNow: HTMLAudioElement | null = null;
export function SongPill({ url, title }: { url: string; title: string }) {
  const [on, setOn] = useState(false);
  const me = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    me.current?.pause();
  }, []);
  const toggle = () => {
    if (on && me.current) {
      me.current.pause();
      setOn(false);
      return;
    }
    if (songNow && songNow !== me.current) songNow.pause();
    const a = me.current || new Audio(url);
    me.current = a;
    a.onpause = () => setOn(false);
    a.onended = () => setOn(false);
    songNow = a;
    void a.play().then(() => setOn(true)).catch(() => setOn(false));
  };
  return (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), toggle())}
      className="flex max-w-full items-center gap-2 rounded-full bg-gradient-to-r from-[#FDF2F8] to-[#EEF2FF] py-1.5 pl-1.5 pr-3.5 text-left text-[13px] font-bold text-[#0B1B3F] ring-1 ring-[#E6E0F5]"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#EC4899] to-[#7C3AED] text-[12px] text-white">{on ? "■" : "▶"}</span>
      <span className="min-w-0 truncate">🎵 {title}</span>
      {on && <span className="shrink-0 text-[11px] font-semibold text-[#7C3AED]">playing</span>}
    </button>
  );
}

// =============================================================================
// 🎵 Post music, the Feed way (2026-11-25): the song's name sits under the writer's
// name, the song plays BY ITSELF while the post is on the screen (60 % or more)
// and stops when it scrolls away. One song at a time. 🔊 / 🔇 on the picture
// mutes every post (kept on this device). Browsers allow sound only after the
// first tap on the page — until then the song waits and starts on that tap.
// =============================================================================
const MUTE_KEY = "migwith.feedSongMute";
type SongState = { id: string; playing: boolean; muted: boolean };
let sState: SongState = { id: "", playing: false, muted: false };
let sAudio: HTMLAudioElement | null = null;
let sUrl = "";
const sListeners = new Set<() => void>();
let sMuteLoaded = false;
function sEmit(next: Partial<SongState>) {
  sState = { ...sState, ...next };
  sListeners.forEach((f) => f());
}
function sLoadMute() {
  if (sMuteLoaded || typeof window === "undefined") return;
  sMuteLoaded = true;
  try {
    sState = { ...sState, muted: localStorage.getItem(MUTE_KEY) === "1" };
  } catch {
    /* storage blocked */
  }
}
function sTryPlay() {
  const a = sAudio;
  if (!a || sState.muted) return;
  void a
    .play()
    .then(() => sEmit({ playing: true }))
    .catch(() => {
      // no tap on the page yet: start on the first one
      const go = () => {
        if (sAudio === a && !sState.muted) void a.play().then(() => sEmit({ playing: true })).catch(() => {});
      };
      window.addEventListener("pointerdown", go, { once: true });
    });
}
export function postSongClaim(id: string, url: string) {
  sLoadMute();
  if (sState.id === id && sUrl === url && sAudio) {
    if (!sState.playing) sTryPlay();
    return;
  }
  sAudio?.pause();
  sAudio = new Audio(url);
  sAudio.loop = true;
  sAudio.onpause = () => sState.id === id && sEmit({ playing: false });
  sAudio.onplaying = () => sState.id === id && sEmit({ playing: true });
  sUrl = url;
  sEmit({ id, playing: false });
  sTryPlay();
}
export function postSongRelease(id: string) {
  if (sState.id !== id) return;
  sAudio?.pause();
  sAudio = null;
  sUrl = "";
  sEmit({ id: "", playing: false });
}
export function postSongToggleMute() {
  sLoadMute();
  const muted = !sState.muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  sEmit({ muted });
  if (muted) sAudio?.pause();
  else sTryPlay();
}
function usePostSongState(): SongState {
  const [, force] = useState(0);
  useEffect(() => {
    sLoadMute();
    const f = () => force((n) => n + 1);
    sListeners.add(f);
    f();
    return () => void sListeners.delete(f);
  }, []);
  return sState;
}
/** Plays the post's song while `ref` is 60 % on the screen (or always, with `always`). */
export function usePostSong(id: string, url: string | undefined, ref: React.RefObject<HTMLElement | null>, always = false) {
  const st = usePostSongState();
  useEffect(() => {
    if (!url) return;
    if (always) {
      postSongClaim(id, url);
      return () => postSongRelease(id);
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.intersectionRatio >= 0.6) postSongClaim(id, url);
          else postSongRelease(id);
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      postSongRelease(id);
    };
  }, [id, url, ref, always]);
  return { playing: st.id === id && st.playing, muted: st.muted, mine: st.id === id };
}

/** 🎵 Feed (2026-11-25 fix): NOT by itself — ▶ on the picture plays it; it stops when the card scrolls away. */
export function postSongTap(id: string, url: string) {
  sLoadMute();
  if (sState.id === id && sState.playing) return postSongRelease(id);
  if (sState.muted) {
    try {
      localStorage.setItem(MUTE_KEY, "0");
    } catch {
      /* storage blocked */
    }
    sEmit({ muted: false });
  }
  postSongClaim(id, url);
}
export function usePostSongTap(id: string, url: string | undefined, ref: React.RefObject<HTMLElement | null>) {
  const st = usePostSongState();
  useEffect(() => {
    if (!url) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return () => postSongRelease(id);
    const io = new IntersectionObserver((es) => es.forEach((e) => e.intersectionRatio < 0.3 && postSongRelease(id)), { threshold: [0, 0.3] });
    io.observe(el);
    return () => {
      io.disconnect();
      postSongRelease(id);
    };
  }, [id, url, ref]);
  return { playing: st.id === id && st.playing, toggle: () => url && postSongTap(id, url) };
}

/** ▶ / ⏸ on the picture's corner (Feed), and "Playing" while it plays */
export function SongPlayCorner({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <>
      {playing && (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-bold text-white">
          ♪ Playing
        </span>
      )}
      <span className="absolute bottom-2.5 right-2.5">
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), onToggle())}
          aria-label={playing ? "Stop the song" : "Play the song"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-[14px] text-white"
        >
          {playing ? "⏸" : "▶"}
        </button>
      </span>
    </>
  );
}

/** 🎵 the song's name under the writer's name */
export function SongLine({ title, className = "" }: { title: string; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-1 text-[12px] font-semibold text-[#16264A] ${className}`}>
      <span className="shrink-0">🎵</span>
      <span className="min-w-0 truncate" data-notranslate>{title}</span>
    </div>
  );
}

/** 🔊 / 🔇 on the picture, and "Playing" while it plays */
export function SongCorner({ playing, muted, inline = false }: { playing: boolean; muted: boolean; inline?: boolean }) {
  const btn = (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), postSongToggleMute())}
      aria-label={muted ? "Turn the song on" : "Mute the song"}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-[15px] ${inline ? "bg-[#F1F4FA] text-[#16264A]" : "bg-black/55 text-white"}`}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
  if (inline) return btn;
  return (
    <>
      {playing && !muted && (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-bold text-white">
          <style>{`@keyframes mgEq{from{height:3px}to{height:12px}}`}</style>
          <span className="inline-flex h-3 items-end gap-[2px]">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className="block w-[3px] rounded-sm bg-[#F472B6]" style={{ animation: `mgEq .${5 + i}s ease-in-out ${i * 0.08}s infinite alternate` }} />
            ))}
          </span>
          Playing
        </span>
      )}
      <span className="absolute bottom-2.5 right-2.5">{btn}</span>
    </>
  );
}
