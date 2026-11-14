"use client";

import { useEffect, useRef, useState } from "react";
import { editChanged, feValues, renderEditedVideo, TEXT_SIZE, VIDEO_FILTERS, type VideoEdit } from "../../lib/videoEdit";
import { videoLengthLabel } from "../../lib/sharePerms";
import { loadSongLibrary, type LibrarySong } from "../../lib/songUpload";

// ✂️ Video editor (miglife, design V1 · dark): opens after a video is picked —
// Feed, rooms and stories — before it is sent. ✂️ Trim (the yellow ends; a long
// video starts cut to miglife's limit) · 🔇 Mute · Aa Text (drag it anywhere) ·
// 🎨 Filter · 🎵 Music (a library song or one from this computer, mixed in;
// with 🔇 Mute only the song is heard). The preview shows everything live; Send makes the real file
// (lib/videoEdit.ts) and gives it back with its length in seconds.

const TEXT_COLORS = ["#FFFFFF", "#FACC15", "#F472B6", "#38BDF8", "#111111"];
const GRAD = "linear-gradient(90deg,#7C3AED,#DB2777)";
const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export function VideoEditor({
  file,
  maxSec,
  sendLabel = "Send",
  onCancel,
  onDone,
}: {
  file: File;
  maxSec: number;
  sendLabel?: string;
  onCancel: () => void;
  onDone: (file: File, seconds: number) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const vid = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const [dur, setDur] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [bad, setBad] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [mute, setMute] = useState(false);
  const [filter, setFilter] = useState("normal");
  const [text, setText] = useState("");
  const [tx, setTx] = useState(0.5);
  const [ty, setTy] = useState(0.18);
  const [tcolor, setTcolor] = useState("#FFFFFF");
  const [tool, setTool] = useState<"trim" | "mute" | "text" | "filter" | "music">("trim");
  // 🎵 the song (a file, so it can be mixed in) and the library
  const [music, setMusic] = useState<{ blob: Blob; title: string; url: string } | null>(null);
  const [library, setLibrary] = useState<LibrarySong[] | null>(null);
  const [songBusy, setSongBusy] = useState("");
  const songRef = useRef<HTMLAudioElement>(null);
  // 🎚 song edit: start point (sec), song length, song / video volume
  const [songStart, setSongStart] = useState(0);
  const [songLen, setSongLen] = useState(0);
  const [songVol, setSongVol] = useState(1);
  const [videoVol, setVideoVol] = useState(1);
  const songCfg = useRef({ start: 0, vol: 1 });
  songCfg.current = { start: songStart, vol: songVol };
  useEffect(() => {
    setSongStart(0);
    setSongLen(0);
  }, [music?.url]);
  useEffect(() => {
    if (vid.current) vid.current.volume = videoVol;
  }, [videoVol]);
  const songInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tool === "music" && library === null) loadSongLibrary().then(setLibrary).catch(() => setLibrary([]));
  }, [tool, library]);
  useEffect(() => () => { if (music) URL.revokeObjectURL(music.url); }, [music]);
  const chooseSong = (blob: Blob, title: string) => setMusic({ blob, title, url: URL.createObjectURL(blob) });
  const chooseLibrary = async (s: LibrarySong) => {
    setSongBusy(s.id);
    setErr("");
    try {
      const r = await fetch(s.url);
      if (!r.ok) throw new Error();
      chooseSong(await r.blob(), s.artist ? `${s.title} · ${s.artist}` : s.title);
    } catch {
      setErr("This song can't be added here. Please choose a song from your computer.");
    } finally {
      setSongBusy("");
    }
  };
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [making, setMaking] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const dragging = useRef<null | "s" | "e">(null);
  const se = useRef({ start: 0, end: 0 });
  se.current = { start, end };

  // the facts + 8 small frames for the strip
  useEffect(() => {
    if (!url) return;
    let gone = false;
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onerror = () => !gone && setBad(true);
    v.onloadedmetadata = async () => {
      if (gone) return;
      let d = Number.isFinite(v.duration) ? v.duration : 0;
      if (!d) {
        // some WebM files (recordings) don't say their length: seek far to find it
        d = await new Promise<number>((res) => {
          const t = window.setTimeout(() => res(0), 4000);
          v.addEventListener("durationchange", function ch() {
            if (Number.isFinite(v.duration)) (window.clearTimeout(t), v.removeEventListener("durationchange", ch), res(v.duration));
          });
          v.currentTime = 1e7;
        });
        v.currentTime = 0;
      }
      if (!d) return setBad(true);
      setDur(d);
      setSize({ w: v.videoWidth, h: v.videoHeight });
      setStart(0);
      setEnd(Math.min(d, maxSec));
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = Math.max(1, Math.round((96 * v.videoHeight) / Math.max(1, v.videoWidth)));
      const ctx = c.getContext("2d");
      const out: string[] = [];
      for (let i = 0; i < 8 && !gone; i++) {
        v.currentTime = (d * (2 * i + 1)) / 16;
        await new Promise<void>((r) => {
          const t = window.setTimeout(r, 1500);
          v.addEventListener("seeked", () => (window.clearTimeout(t), r()), { once: true });
        });
        try {
          ctx?.drawImage(v, 0, 0, c.width, c.height);
          out.push(c.toDataURL("image/jpeg", 0.6));
        } catch {
          break;
        }
      }
      if (!gone) setThumbs(out);
      v.removeAttribute("src");
      v.load();
    };
    return () => {
      gone = true;
    };
  }, [url, maxSec]);

  // keeps playing inside the cut part
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    const t = window.setInterval(() => {
      if (dragging.current) return;
      setPos(v.currentTime);
      if (!v.paused && (v.currentTime >= se.current.end || v.currentTime < se.current.start - 0.4)) v.currentTime = se.current.start;
      // 🎵 the song at the same place as the cut part
      const a = songRef.current;
      if (a && a.src) {
        if (v.paused) a.pause();
        else {
          a.volume = songCfg.current.vol;
          const full = a.duration && Number.isFinite(a.duration) ? a.duration : 0;
          const s0 = full ? Math.min(songCfg.current.start, Math.max(0, full - 1)) : 0;
          const len = full - s0;
          const want = len > 0 ? s0 + (Math.max(0, v.currentTime - se.current.start) % len) : 0;
          if (Math.abs(a.currentTime - want) > 0.45) a.currentTime = want;
          if (a.paused) void a.play().catch(() => {});
        }
      }
    }, 80);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (vid.current) vid.current.muted = mute;
  }, [mute]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dur]);

  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) void v.play().then(() => setPlaying(true)).catch(() => {});
    else (v.pause(), setPlaying(false));
  };

  // ✂️ drag the ends
  const onStripDown = (ev: React.PointerEvent) => {
    const el = strip.current;
    if (!el || !dur) return;
    const r = el.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const sx = (start / dur) * r.width, ex = (end / dur) * r.width;
    dragging.current = Math.abs(x - sx) <= Math.abs(x - ex) ? "s" : "e";
    el.setPointerCapture(ev.pointerId);
    vid.current?.pause();
    setPlaying(false);
    onStripMove(ev);
  };
  const onStripMove = (ev: React.PointerEvent) => {
    const el = strip.current;
    if (!el || !dragging.current || !dur) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(dur, Math.max(0, ((ev.clientX - r.left) / r.width) * dur));
    const { start: s, end: e } = se.current;
    if (dragging.current === "s") {
      const ns = Math.min(Math.max(t, Math.max(0, e - maxSec)), Math.max(0, e - 1));
      setStart(ns);
      if (vid.current) vid.current.currentTime = ns;
      setPos(ns);
    } else {
      const ne = Math.max(Math.min(t, Math.min(dur, s + maxSec)), Math.min(dur, s + 1));
      setEnd(ne);
      if (vid.current) vid.current.currentTime = ne;
      setPos(ne);
    }
  };
  const onStripUp = () => {
    if (!dragging.current) return;
    dragging.current = null;
    const v = vid.current;
    if (v) {
      v.currentTime = se.current.start;
      void v.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  // Aa drag the words
  const textDrag = useRef<{ x: number; y: number } | null>(null);
  const onTextDown = (ev: React.PointerEvent) => {
    ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    textDrag.current = { x: ev.clientX, y: ev.clientY };
  };
  const onTextMove = (ev: React.PointerEvent) => {
    const el = box.current;
    if (!textDrag.current || !el) return;
    const dx = ev.clientX - textDrag.current.x, dy = ev.clientY - textDrag.current.y;
    textDrag.current = { x: ev.clientX, y: ev.clientY };
    setTx((v) => Math.min(1, Math.max(0, v + dx / el.clientWidth)));
    setTy((v) => Math.min(1, Math.max(0, v + dy / el.clientHeight)));
  };

  const send = async () => {
    if (!dur || making !== null) return;
    const edit: VideoEdit = {
      startSec: start, endSec: end, durationSec: dur, mute, filter, text: text.trim(), textX: tx, textY: ty, textColor: tcolor,
      videoW: size.w, videoH: size.h,
      music: music?.blob || null,
      musicStartSec: music ? songStart : 0,
      musicVol: songVol,
      videoVol,
    };
    songRef.current?.pause();
    vid.current?.pause();
    setPlaying(false);
    if (!editChanged(edit)) return onDone(file, dur);
    setErr("");
    setMaking(0);
    try {
      const out = await renderEditedVideo(file, edit, setMaking);
      onDone(out, end - start);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The video could not be made.");
    } finally {
      setMaking(null);
    }
  };

  const ratio = size.w && size.h ? size.w / size.h : 9 / 16;
  const fm = VIDEO_FILTERS.find((f) => f.key === filter && f.key !== "normal");
  const cssFilter = fm ? `url(#ve-f-${fm.key})` : "none";
  const sPct = dur ? (start / dur) * 100 : 0;
  const ePct = dur ? (end / dur) * 100 : 100;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0B0B10] text-white" role="dialog" aria-label="Edit video">
      {/* the colour filters (the same numbers as the app) */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        {VIDEO_FILTERS.filter((f) => f.key !== "normal").map((f) => (
          <filter key={f.key} id={`ve-f-${f.key}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={feValues(f.m)} />
          </filter>
        ))}
      </svg>

      <div className="flex items-center px-4 py-3">
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full px-2 text-[22px] opacity-85">✕</button>
        <span className="flex-1 text-center text-[16px] font-bold">Edit video</span>
        <button
          type="button"
          onClick={send}
          disabled={!dur || making !== null}
          className="rounded-full px-[18px] py-2 text-[14px] font-extrabold disabled:opacity-50"
          style={{ background: dur ? GRAD : "#3F3F46" }}
        >
          {sendLabel} ➜
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-1">
        {bad ? (
          <p className="opacity-80">This video can&apos;t be opened. Please choose an MP4, WebM or MOV video.</p>
        ) : (
          <div
            ref={box}
            className="relative max-h-full max-w-full overflow-hidden rounded-[18px] bg-black"
            style={{ aspectRatio: `${ratio}`, height: ratio < 1 ? "100%" : "auto", width: ratio < 1 ? "auto" : "100%" }}
          >
            <video
              ref={vid}
              src={url || undefined}
              playsInline
              autoPlay
              muted={mute}
              onLoadedData={() => setPlaying(!vid.current?.paused)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                const v = vid.current;
                if (v) (v.currentTime = se.current.start), void v.play().catch(() => {});
              }}
              className="h-full w-full object-contain"
              style={{ filter: cssFilter }}
            />
            <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle} className="absolute inset-0" />
            {!playing && dur > 0 && (
              <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[22px] text-[#111]">▶</span>
            )}
            {text.trim() && (
              <span
                onPointerDown={onTextDown}
                onPointerMove={onTextMove}
                onPointerUp={() => (textDrag.current = null)}
                className={`absolute cursor-move touch-none whitespace-nowrap rounded-md px-2 font-black leading-[1.25] ${tool === "text" ? "outline-dashed outline-[1.5px] outline-white/60" : ""}`}
                style={{
                  left: `${tx * 100}%`,
                  top: `${ty * 100}%`,
                  transform: `translate(${-tx * 100}%, ${-ty * 100}%)`,
                  color: tcolor,
                  fontSize: `${Math.max(10, boxW * TEXT_SIZE)}px`,
                  textShadow: "0 3px 8px rgba(0,0,0,.7)",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {text}
              </span>
            )}
            <span className="pointer-events-none absolute bottom-2.5 right-3 rounded-lg bg-black/50 px-2 py-0.5 text-[12px]">
              {music ? "🎵 " : ""}
              {mute ? "🔇 " : ""}
              {fmt(pos - start)} / {fmt(end - start)}
            </span>
          </div>
        )}
      </div>

      {dur > 0 && (
        <>
          <div
            ref={strip}
            onPointerDown={onStripDown}
            onPointerMove={onStripMove}
            onPointerUp={onStripUp}
            onPointerCancel={onStripUp}
            className="relative mx-4 mt-3 h-[52px] touch-none select-none overflow-hidden rounded-[10px] bg-[#27272A]"
          >
            <div className="flex h-full">
              {thumbs.map((t, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={t} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" style={{ filter: cssFilter }} />
              ))}
            </div>
            <div className="absolute inset-y-0 left-0 bg-black/70" style={{ width: `${sPct}%` }} />
            <div className="absolute inset-y-0 right-0 bg-black/70" style={{ width: `${100 - ePct}%` }} />
            <div className="absolute inset-y-0 rounded-lg border-[3px] border-[#FACC15]" style={{ left: `${sPct}%`, width: `${ePct - sPct}%` }} />
            <div className="absolute top-[14px] h-6 w-[7px] -translate-x-1/2 rounded bg-[#FACC15]" style={{ left: `${sPct}%` }} />
            <div className="absolute top-[14px] h-6 w-[7px] -translate-x-1/2 rounded bg-[#FACC15]" style={{ left: `${ePct}%` }} />
          </div>
          <div className="mx-4 mt-1 flex text-[12px] opacity-70">
            <span>{fmt(start)}</span>
            <span className="flex-1 text-center">✂️ {Math.round(end - start)} sec kept · max {videoLengthLabel(maxSec)}</span>
            <span>{fmt(end)}</span>
          </div>
        </>
      )}

      <div className="mt-3 flex justify-around">
        {(
          [
            ["trim", "✂️", "Trim", tool === "trim"],
            ["mute", mute ? "🔇" : "🔊", mute ? "Muted" : "Mute", mute],
            ["text", "Aa", "Text", tool === "text"],
            ["filter", "🎨", "Filter", tool === "filter" || filter !== "normal"],
            ["music", "🎵", "Music", tool === "music" || !!music],
          ] as const
        ).map(([k, icon, label, on]) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === "mute" && setMute((m) => !m), setTool(k))}
            className="flex flex-col items-center gap-1 rounded-xl p-1 text-[12px]"
            style={{ opacity: on ? 1 : 0.75 }}
          >
            <span className="grid h-[46px] w-[46px] place-items-center rounded-[14px] text-[20px] font-bold" style={{ background: on ? GRAD : "rgba(255,255,255,.08)" }}>
              {icon}
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className={`flex ${tool === "music" && music ? "h-[168px]" : "h-[96px]"} items-center px-4 py-2.5`}>
        {tool === "trim" && <p className="text-[13px] opacity-60">Drag the yellow ends to choose the part to keep.</p>}
        {tool === "music" && (
          <div className="w-full">
            <input
              ref={songInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) chooseSong(f, f.name.replace(/\.[^.]+$/, "").slice(0, 40) || "My song");
              }}
            />
            {music ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">🎵 {music.title}</span>
                  <button type="button" onClick={() => setMusic(null)} className="rounded-full px-2.5 py-1 text-[12.5px] font-bold text-[#FCA5A5]">✕ Remove</button>
                </div>
                {/* 🎚 song edit */}
                {songLen > 1 ? (
                  <label className="mt-1.5 block text-[12px] opacity-80">
                    ▶ Song starts at {clock(songStart)} / {clock(songLen)}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, songLen - 1)}
                      step={0.5}
                      value={Math.min(songStart, Math.max(0, songLen - 1))}
                      onChange={(ev) => setSongStart(Number(ev.target.value))}
                      className="mt-1 block w-full accent-[#A78BFA]"
                    />
                  </label>
                ) : (
                  <p className="mt-1.5 text-[12px] opacity-50">Loading the song…</p>
                )}
                <div className="mt-2 flex gap-4">
                  <label className="min-w-0 flex-1 text-[12px] opacity-80">
                    🎵 Song {Math.round(songVol * 100)}%
                    <input type="range" min={0} max={1} step={0.05} value={songVol} onChange={(ev) => setSongVol(Number(ev.target.value))} className="mt-1 block w-full accent-[#A78BFA]" />
                  </label>
                  <label className="min-w-0 flex-1 text-[12px] opacity-80">
                    {mute ? "🔇 Video sound off" : `🎬 Video sound ${Math.round(videoVol * 100)}%`}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={mute ? 0 : videoVol}
                      onChange={(ev) => {
                        const x = Number(ev.target.value);
                        setVideoVol(x);
                        if (mute && x > 0) setMute(false);
                      }}
                      className="mt-1 block w-full accent-[#A78BFA]"
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                <button type="button" onClick={() => songInput.current?.click()} className="shrink-0 rounded-full px-3 py-[7px] text-[13px] font-bold" style={{ background: GRAD }}>
                  💻 From computer
                </button>
                {library === null && <span className="shrink-0 py-[7px] text-[13px] opacity-50">Loading songs…</span>}
                {(library || []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!!songBusy}
                    onClick={() => chooseLibrary(s)}
                    className="max-w-[200px] shrink-0 truncate rounded-full bg-white/10 px-3 py-[7px] text-[13px] disabled:opacity-50"
                  >
                    {songBusy === s.id ? "⏳" : "🎵"} {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {tool === "mute" && <p className="text-[13px] opacity-70">{mute ? "🔇 The video will be sent without sound. Tap Mute again to keep the sound." : "🔊 The sound is kept."}</p>}
        {tool === "text" && (
          <div className="w-full">
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 60))}
              placeholder="Write on the video… then drag it"
              className="w-full rounded-xl bg-white/[.08] px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/40"
            />
            <div className="mt-2 flex gap-2.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Text colour ${c}`}
                  onClick={() => setTcolor(c)}
                  className="h-6 w-6 rounded-full"
                  style={{ background: c, border: tcolor === c ? "2.5px solid #FACC15" : "1px solid rgba(255,255,255,.4)" }}
                />
              ))}
            </div>
          </div>
        )}
        {tool === "filter" && (
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto">
            {VIDEO_FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className="flex shrink-0 flex-col items-center text-[11px]" style={{ opacity: filter === f.key ? 1 : 0.75 }}>
                <span
                  className="block h-[52px] w-[52px] overflow-hidden rounded-xl bg-[#27272A]"
                  style={{ outline: filter === f.key ? "2.5px solid #FACC15" : "none", outlineOffset: -2 }}
                >
                  {thumbs[4] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[4]} alt="" className="h-full w-full object-cover" style={{ filter: f.key === "normal" ? "none" : `url(#ve-f-${f.key})` }} />
                  )}
                </span>
                <span className="mt-1">{f.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {music && (
        <audio
          ref={songRef}
          src={music.url}
          loop
          preload="auto"
          onLoadedMetadata={(ev) => {
            const d = ev.currentTarget.duration;
            if (Number.isFinite(d)) setSongLen(d);
          }}
        />
      )}
      {err && <p className="px-4 pb-3 text-[13px] text-[#FCA5A5]">{err}</p>}

      {making !== null && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 px-8 text-center">
          <p className="text-[16px] font-extrabold">🎬 Making your video… {making}%</p>
          <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full" style={{ width: `${making}%`, background: GRAD }} />
          </div>
          <p className="text-[12.5px] opacity-70">Please keep this tab open — it takes as long as the video.</p>
        </div>
      )}
    </div>
  );
}

// 0:42 style time for the song edit
function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
