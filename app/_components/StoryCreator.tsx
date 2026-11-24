"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { blogCall, blogError } from "../../lib/feed";
import { uploadChatImage } from "../../lib/imageUpload";
import { loadSongLibrary, type LibrarySong } from "../../lib/songUpload";
import { STORIES_CHANGED } from "../../lib/stories";
import { StoryDecorEditor, type StoryOverlay } from "./StoryOverlays";
import type { StorySong } from "./StoryRow";

// 📸 Story v2 (miglife 2026-11-24): Create story → editor → who can see it → Share.
//  1. Create story: Aa Text · 🎵 Music · 🖼 Templates, then photos from the phone
//     (Select multiple = several stories at once) and 🎬 a video (the video editor).
//  2. The editor: Music · Stickers (place, time, date, poll, question, mention, link,
//     thoughts, birthday, emoji) · Text · Effects · Mention · Link (StoryDecorEditor).
//  3. Who can see it: Everyone · Friends · Close friends · Only me, replies on / off.

type Audience = "everyone" | "friends" | "close" | "only_me";
const TEMPLATES = ["Good morning ☀️", "Jummah Mubarak 🕌", "Happy Birthday 🎂", "Missing you 💭", "Alhamdulillah 🤲", "Weekend vibes 🎉", "Good night 🌙", "Thank you all ❤️"];
const TEXT_BG = "linear-gradient(135deg,#38BDF8,#6366F1 55%,#A855F7)";

export function StoryCreator({ uid, onClose, onVideo }: { uid: string; onClose: () => void; onVideo?: () => void }) {
  const [step, setStep] = useState<"pick" | "text" | "edit" | "share">("pick");
  const [multi, setMulti] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [fx, setFx] = useState(0);
  const [song, setSong] = useState<StorySong | null>(null);
  const [songs, setSongs] = useState<LibrarySong[] | null>(null);
  const [songSheet, setSongSheet] = useState(false);
  const [audience, setAudience] = useState<Audience>("everyone");
  const [replies, setReplies] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const pickPhotos = async (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/")).slice(0, multi ? 10 : 1);
    if (!list.length) return;
    setErr("");
    try {
      const urls: string[] = [];
      for (let i = 0; i < list.length; i++) {
        setBusy(`Uploading ${i + 1} / ${list.length}…`);
        urls.push(await uploadChatImage(`blog_stories/${uid}`, list[i]));
      }
      setPhotos(urls);
      setStep("edit");
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy("");
    }
  };

  const openSongs = async () => {
    setSongSheet(true);
    if (songs === null) setSongs(await loadSongLibrary().catch(() => []));
  };
  const stopPreview = () => {
    preview.current?.pause();
    preview.current = null;
  };

  const share = async () => {
    setErr("");
    setBusy("Sharing…");
    try {
      const common = { song, overlays, fx, privacy: audience, allowReplies: replies };
      if (photos.length) {
        // the words and stickers go on the first story; the others are the photos alone
        for (let i = 0; i < photos.length; i++) {
          setBusy(photos.length > 1 ? `Sharing ${i + 1} / ${photos.length}…` : "Sharing…");
          await blogCall("story", i === 0 ? { url: photos[i], ...common } : { url: photos[i], fx, privacy: audience, allowReplies: replies });
        }
      } else {
        await blogCall("story", { text: text.trim(), ...common });
      }
      window.dispatchEvent(new Event(STORIES_CHANGED));
      stopPreview();
      onClose();
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy("");
    }
  };

  const background = photos.length ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photos[0]} alt="" className="max-h-full max-w-full object-contain" />
  ) : (
    <div className="flex h-full w-full items-center justify-center p-8 text-center text-[28px] font-extrabold leading-snug text-white" style={{ background: TEXT_BG }}>
      {text}
    </div>
  );

  // over the whole page (also over the top bar): drawn straight into <body>
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-center bg-black/60" role="dialog" aria-label="Create story">
      {/* 1 · Create story */}
      {step === "pick" && (
        <div className="relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-white text-[#0B1B3F]">
          <div className="flex items-center justify-between px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center text-[22px]" aria-label="Close">✕</button>
            <span className="text-[18px] font-bold">Create story</span>
            <span className="w-10" />
          </div>
          <div className="flex gap-2.5 px-3.5 pb-3 pt-1.5">
            {(
              [
                ["Aa", "Text", "linear-gradient(135deg,#2563EB,#7C3AED)", () => (setText(""), setStep("text"))],
                ["🎵", "Music", "linear-gradient(135deg,#EC4899,#F97316)", () => (setText(""), setStep("text"), void openSongs())],
                ["🖼", "Templates", "linear-gradient(135deg,#0EA5E9,#14B8A6)", () => (setText(TEMPLATES[0]), setStep("text"))],
              ] as [string, string, string, () => void][]
            ).map(([icon, label, bg, run]) => (
              <button key={label} type="button" onClick={run} className="flex h-24 flex-1 flex-col items-center justify-center gap-1.5 rounded-[18px] text-[14px] font-bold text-white transition active:scale-95" style={{ background: bg }}>
                <span className="text-[26px] font-black leading-none">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-4 pb-2.5 text-[14px] font-semibold">
            <span>Gallery</span>
            <button type="button" onClick={() => setMulti((m) => !m)} className={`rounded-full border-[1.5px] px-3 py-1.5 text-[13px] ${multi ? "border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]" : "border-[#CBD5E1]"}`}>
              {multi ? "☑" : "☐"} Select multiple
            </button>
          </div>
          <input ref={photoInput} type="file" accept="image/*" multiple={multi} hidden onChange={(e) => (void pickPhotos(e.target.files), (e.target.value = ""))} />
          <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void pickPhotos(e.target.files), (e.target.value = ""))} />
          <div className="grid grid-cols-3 gap-[3px] px-[3px]">
            <button type="button" onClick={() => photoInput.current?.click()} disabled={!!busy} className="flex h-40 flex-col items-center justify-center gap-2 bg-[#EEF2FA] text-[13px] font-bold text-[#1D4ED8]">
              <span className="text-[34px]">🖼</span>
              {multi ? "Choose photos" : "Choose a photo"}
            </button>
            {onVideo && (
              <button type="button" onClick={onVideo} disabled={!!busy} className="flex h-40 flex-col items-center justify-center gap-2 bg-[#F3E8FF] text-[13px] font-bold text-[#7C3AED]">
                <span className="text-[34px]">🎬</span>
                Video
              </button>
            )}
            <button type="button" onClick={() => camInput.current?.click()} disabled={!!busy} className="flex h-40 flex-col items-center justify-center gap-2 bg-[#ECFDF5] text-[13px] font-bold text-[#059669]">
              <span className="text-[34px]">📷</span>
              Camera
            </button>
          </div>
          {(busy || err) && <p className={`px-4 pt-3 text-[13px] font-bold ${err ? "text-[#B91C1C]" : "text-[#1D4ED8]"}`}>{err || busy}</p>}
        </div>
      )}

      {/* Aa — a text story (Templates fill the words) */}
      {step === "text" && (
        <div className="relative flex h-full w-full max-w-[480px] flex-col" style={{ background: TEXT_BG }}>
          <div className="flex items-center justify-between p-3">
            <button type="button" onClick={() => setStep("pick")} className="grid h-10 w-10 place-items-center rounded-full bg-black/30 text-[16px] font-bold text-white">←</button>
            <button type="button" disabled={!text.trim()} onClick={() => setStep("edit")} className="rounded-full bg-white px-5 py-2 text-[14px] font-black text-[#1D4ED8] disabled:opacity-50">Next</button>
          </div>
          <div className="flex flex-1 items-center justify-center px-6">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 280))}
              placeholder="Start typing…"
              rows={4}
              className="w-full resize-none bg-transparent text-center text-[28px] font-extrabold leading-snug text-white outline-none placeholder:text-white/60"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 pb-5 [scrollbar-width:none]">
            {TEMPLATES.map((t) => (
              <button key={t} type="button" onClick={() => setText(t)} className="shrink-0 rounded-full bg-white/20 px-3.5 py-2 text-[13px] font-bold text-white">
                {t}
              </button>
            ))}
          </div>
          {song && <div className="absolute left-16 top-5 max-w-[50%] truncate rounded-full bg-black/35 px-3 py-1.5 text-[12.5px] font-bold text-white">🎵 {song.title}</div>}
        </div>
      )}

      {/* 2 · the editor */}
      {step === "edit" && (
        <StoryDecorEditor
          background={background}
          initial={overlays}
          fx={photos.length ? fx : undefined}
          onFx={photos.length ? setFx : undefined}
          musicTitle={song?.title}
          onMusic={() => void openSongs()}
          doneLabel="Next ➤"
          onCancel={() => (photos.length ? (setPhotos([]), setStep("pick")) : setStep("text"))}
          onDone={(items) => (setOverlays(items), setStep("share"))}
        />
      )}

      {/* 3 · who can see it */}
      {step === "share" && (
        <div className="relative flex h-full w-full max-w-[480px] flex-col justify-end" style={{ background: photos.length ? "#000" : TEXT_BG }}>
          <div className="absolute inset-0 opacity-50">{background}</div>
          <div className="relative rounded-t-[26px] bg-white px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 text-[#0B1B3F]">
            <div className="mx-auto mb-3 h-[5px] w-11 rounded-full bg-[#CBD5E1]" />
            <p className="mb-1 text-[17px] font-extrabold">Who can see this story?</p>
            {(
              [
                ["everyone", "🌍 Everyone"],
                ["friends", "👥 Friends"],
                ["close", "⭐ Close friends"],
                ["only_me", "🔒 Only me"],
              ] as [Audience, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setAudience(k)} className="flex w-full items-center gap-3 border-b border-[#EEF2F8] px-1 py-3.5 text-left text-[15px]">
                {label}
                <span className={`ml-auto h-[22px] w-[22px] rounded-full ${audience === k ? "border-[7px] border-[#1D4ED8]" : "border-2 border-[#94A3B8]"}`} />
              </button>
            ))}
            <button type="button" onClick={() => setReplies((r) => !r)} className="flex w-full items-center gap-3 px-1 py-3.5 text-left text-[15px]">
              💬 Allow replies
              <span className={`relative ml-auto h-[26px] w-[46px] rounded-full ${replies ? "bg-[#22C55E]" : "bg-[#CBD5E1]"}`}>
                <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${replies ? "left-[23px]" : "left-[3px]"}`} />
              </span>
            </button>
            {err && <p className="pb-2 text-[13px] font-bold text-[#B91C1C]">{err}</p>}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setStep("edit")} className="h-[52px] rounded-2xl bg-[#EEF2FA] px-5 text-[15px] font-bold text-[#1F2A44]">← Back</button>
              <button type="button" disabled={!!busy} onClick={() => void share()} className="h-[52px] flex-1 rounded-2xl bg-[#1D4ED8] text-[15px] font-extrabold text-white disabled:opacity-60">
                {busy || (photos.length > 1 ? `Share ${photos.length} stories ➤` : "Share story ➤")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎵 the song list (miGlife's own songs) */}
      {songSheet && (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/45" onClick={() => (stopPreview(), setSongSheet(false))}>
          <div className="mx-auto max-h-[70%] w-full max-w-[480px] overflow-y-auto rounded-t-[26px] bg-white p-4 text-[#0B1B3F]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-[5px] w-11 rounded-full bg-[#CBD5E1]" />
            <div className="mb-2 flex items-center">
              <p className="text-[16px] font-extrabold">🎵 Music</p>
              <span className="flex-1" />
              {song && (
                <button type="button" onClick={() => (setSong(null), stopPreview())} className="rounded-full bg-[#FEE2E2] px-3 py-1 text-[12px] font-bold text-[#B91C1C]">Remove song</button>
              )}
            </div>
            {songs === null && <p className="py-3 text-[13px] text-[#64748B]">Loading…</p>}
            {songs !== null && songs.length === 0 && <p className="py-3 text-[13px] text-[#64748B]">No songs yet.</p>}
            {(songs || []).map((x) => (
              <div key={x.id} className="flex items-center gap-3 border-b border-[#EEF2F8] py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    stopPreview();
                    const a = new Audio(x.url);
                    preview.current = a;
                    void a.play().catch(() => {});
                  }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EEF2FA] text-[15px]"
                  aria-label="Listen"
                >
                  ▶
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold">{x.title}</span>
                  <span className="block truncate text-[12px] text-[#64748B]">{x.artist || x.category}</span>
                </span>
                <button
                  type="button"
                  onClick={() => (setSong({ url: x.url, title: x.title, startSec: 0 }), stopPreview(), setSongSheet(false))}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold ${song?.url === x.url ? "bg-[#1D4ED8] text-white" : "bg-[#EEF2FA] text-[#1D4ED8]"}`}
                >
                  {song?.url === x.url ? "✓ Added" : "Add"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    ,
    document.body
  );
}
