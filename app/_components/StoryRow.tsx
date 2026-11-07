"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { blogAgoBn, blogCall, blogError } from "../../lib/feed";
import { uploadChatImage } from "../../lib/imageUpload";
import { loadStories, type Story } from "../../lib/stories";
import { loadSongLibrary, type LibrarySong, STORY_SONG_SECONDS, uploadStorySong } from "../../lib/songUpload";

export type StorySong = { url: string; title: string; startSec: number };

// 📸 The story row above the feed: "Your story" adds one (photo, caption, who sees it).
// Tap a ring to watch (5 s each). The writer can edit the caption / audience or delete it.

type Audience = "everyone" | "friends" | "only_me";

export function StoryRow({
  myUid,
  myName,
  friends,
  colorOf,
}: {
  myUid?: string;
  myName: string;
  friends: string[];
  colorOf: (name: string) => string;
}) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<Story[] | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // a photo waiting for its caption
  const [textDraft, setTextDraft] = useState(false); // a text-only story being written
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    loadStories()
      .then(setStories)
      .catch(() => setStories([]));
  useEffect(() => {
    reload();
  }, []);

  // 👥 friends-only stories show to the writer and their friends
  const visible = useMemo(() => {
    const mine = new Set(friends);
    return (stories || []).filter((s) => {
      if (s.privacy === "only_me") return s.author === myName;
      if (s.privacy === "friends") return s.author === myName || mine.has(s.author);
      return true;
    });
  }, [stories, friends, myName]);

  const byAuthor = useMemo(() => {
    const m = new Map<string, Story[]>();
    visible.forEach((s) => m.set(s.author, [...(m.get(s.author) || []), s]));
    return [...m.entries()];
  }, [visible]);

  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);
  const [index, setIndex] = useState(0);

  // the viewer moves on by itself after 5 seconds, unless the writer's menu or editor is open
  useEffect(() => {
    if (!viewer || menu || editing) return;
    const t = window.setTimeout(() => {
      if (index + 1 < viewer.length) setIndex(index + 1);
      else setViewer(null);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [viewer, index, menu, editing]);

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !myUid) return;
    setError("");
    setBusy(true);
    try {
      setDraft(await uploadChatImage(`blog_stories/${myUid}`, f));
    } catch (e) {
      setError(blogError(e));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (data: { url?: string; caption?: string; text?: string; song?: StorySong | null }, privacy: Audience) => {
    setError("");
    try {
      await blogCall("story", { ...data, privacy });
      await reload();
    } catch (e) {
      setError(blogError(e));
    }
  };

  const current = viewer ? viewer[Math.min(index, viewer.length - 1)] : null;
  const mine = !!current && !!myUid && current.authorUid === myUid;

  const removeCurrent = async () => {
    if (!current || !confirm("Delete this story? It will be gone for everyone.")) return;
    try {
      await blogCall("storyDelete", { storyId: current.id });
      setViewer(null);
      await reload();
    } catch (e) {
      setError(blogError(e));
    }
  };

  const ring = (name: string, extra: React.ReactNode, onClick: () => void) => (
    <button key={name} type="button" onClick={onClick} className="story-item flex w-[68px] shrink-0 flex-col items-center gap-1 text-center">
      <span className="story-ring flex h-[62px] w-[62px] items-center justify-center rounded-full p-[2.5px]">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-[18px] font-black text-[#6366F1]">
          {extra}
        </span>
      </span>
      <span className="w-full truncate text-[11.5px] font-bold text-[#1E1B4B]">{name}</span>
    </button>
  );

  return (
    <>
      {error && <p className="mx-3.5 mb-1 text-[12.5px] text-[#B91C1C]">{error}</p>}
      <div className="no-scrollbar mx-3.5 mb-2 flex gap-3 overflow-x-auto pb-1">
        {myUid && (
          <>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files), (e.target.value = ""))} />
            <button type="button" onClick={() => setTextDraft(true)} disabled={busy} className="flex w-[68px] shrink-0 flex-col items-center gap-1 text-center disabled:opacity-60">
              <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-[#6366F1] bg-white text-[24px] font-black text-[#6366F1]">{busy ? "…" : "+"}</span>
              <span className="w-full truncate text-[11.5px] font-bold text-[#1E1B4B]">Your story</span>
            </button>
          </>
        )}
        {byAuthor.map(([name, items]) => ring(name, name.slice(0, 1).toUpperCase(), () => { setIndex(0); setViewer(items); }))}
        {stories !== null && byAuthor.length === 0 && <span className="self-center text-[12px] text-[#6B6F9A]">No stories in the last 24 hours.</span>}
      </div>

      {draft && (
        <StoryDialog
          uid={myUid}
          title="Add to your story"
          caption=""
          audience="everyone"
          confirmText="Share story"
          maxLen={140}
          placeholder="Write a caption… (optional)"
          hasMedia
          onClose={() => setDraft(null)}
          onConfirm={(caption, audience, song) => {
            const url = draft;
            setDraft(null);
            publish({ url, caption, song }, audience);
          }}
        />
      )}

      {textDraft && (
        <StoryDialog
          uid={myUid}
          title="New story"
          caption=""
          audience="everyone"
          confirmText="Share story"
          maxLen={280}
          placeholder="What's on your mind?"
          allowPhoto
          onClose={() => setTextDraft(false)}
          onConfirm={(text, audience, song, photoUrl) => {
            setTextDraft(false);
            // a photo in a text story: the photo is the story, the text is its caption
            if (photoUrl) publish({ url: photoUrl, caption: text, song }, audience);
            else publish({ text, song }, audience);
          }}
        />
      )}

      {viewer && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" role="dialog" aria-label="Story">
          {current.song && (
            // 🎵 the song starts at its chosen point and stops after 30 seconds
            <audio
              key={current.id}
              src={current.song.url}
              autoPlay
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = current.song?.startSec ?? 0;
              }}
              onTimeUpdate={(e) => {
                if (e.currentTarget.currentTime - (current.song?.startSec ?? 0) >= STORY_SONG_SECONDS) e.currentTarget.pause();
              }}
            />
          )}
          {current.url ? (
            <img src={current.url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] p-7 text-center text-[24px] font-extrabold leading-snug text-white">
              {current.text}
            </div>
          )}
          <button type="button" aria-label="Previous" onClick={() => setIndex((i) => Math.max(0, i - 1))} className="absolute bottom-0 left-0 top-0 w-1/3" />
          <button
            type="button"
            aria-label="Next"
            onClick={() => (viewer && index + 1 < viewer.length ? setIndex(index + 1) : setViewer(null))}
            className="absolute bottom-0 right-0 top-0 w-2/3"
          />
          <div className="absolute left-0 right-0 top-0 flex items-center gap-2 px-4 pt-4 text-white">
            <span className="font-extrabold">{current.author}</span>
            {current.privacy === "friends" && <span className="text-[12px] opacity-80">👥</span>}
            {current.privacy === "only_me" && <span className="text-[12px] opacity-80">🔒</span>}
            <span className="text-[12px] opacity-80">{blogAgoBn(current.createdMs)}</span>
            {mine && (
              <button type="button" onClick={() => setMenu(true)} aria-label="Story options" className="ml-auto rounded-full bg-white/20 px-3 py-1 font-black">
                ⋯
              </button>
            )}
            <button type="button" onClick={() => setViewer(null)} className={`${mine ? "" : "ml-auto"} rounded-full bg-white/20 px-3 py-1 font-bold`}>
              ✕
            </button>
          </div>
          {current.song && (
            <span className="absolute bottom-3 left-6 right-6 truncate text-center text-[12px] font-bold text-white/90">🎵 {current.song.title}</span>
          )}
          {current.url && current.caption && (
            <p className="story-glass absolute bottom-10 left-6 right-6 rounded-2xl px-4 py-2.5 text-center text-[15px] font-bold text-white">{current.caption}</p>
          )}
          {menu && (
            <div className="absolute inset-x-6 bottom-24 z-10 rounded-2xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
              {current.url && (
                <button type="button" onClick={() => { setMenu(false); setEditing(current); }} className="block w-full rounded-xl px-3 py-3 text-left font-bold text-[#2563EB] hover:bg-[#F3F6FF]">
                  ✏️ Edit caption and audience
                </button>
              )}
              <button type="button" onClick={() => { setMenu(false); removeCurrent(); }} className="block w-full rounded-xl px-3 py-3 text-left font-bold text-[#DC2626] hover:bg-[#FFF1F2]">
                🗑 Delete story
              </button>
              <button type="button" onClick={() => setMenu(false)} className="mt-1 block w-full rounded-xl px-3 py-2 text-center text-[#6B6F9A]">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <StoryDialog
          uid={myUid}
          title="Edit story"
          caption={editing.caption}
          audience={editing.privacy}
          confirmText="Save"
          onClose={() => setEditing(null)}
          onConfirm={async (caption, audience) => {
            const id = editing.id;
            setEditing(null);
            try {
              await blogCall("storyUpdate", { storyId: id, caption, privacy: audience });
              setViewer(null);
              await reload();
            } catch (e) {
              setError(blogError(e));
            }
          }}
        />
      )}
    </>
  );
}

// the caption and the audience (everyone / friends), used to add and to edit a story
function StoryDialog({
  uid,
  title,
  caption: caption0,
  audience: audience0,
  confirmText,
  maxLen = 140,
  placeholder = "Write a caption… (optional)",
  onClose,
  onConfirm,
  allowPhoto = false,
  hasMedia = false,
}: {
  uid?: string;
  title: string;
  caption: string;
  audience: Audience;
  confirmText: string;
  maxLen?: number;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (caption: string, audience: Audience, song?: StorySong | null, photoUrl?: string | null) => void;
  /** a text story may also get a photo, added right here */
  allowPhoto?: boolean;
  /** the photo is already chosen (the add-photo flow) */
  hasMedia?: boolean;
}) {
  const [caption, setCaption] = useState(caption0);
  const [audience, setAudience] = useState<Audience>(audience0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  // Share works only with text or a photo
  const canShare = hasMedia || !!photoUrl || caption.trim().length > 0;
  // 🎵 an optional song (plays for the first 30 seconds of the story)
  const [song, setSong] = useState<StorySong | null>(null);
  const [songBusy, setSongBusy] = useState(false);
  const [songErr, setSongErr] = useState("");
  const [library, setLibrary] = useState<LibrarySong[] | null>(null);
  const [showLib, setShowLib] = useState(false);
  const songInput = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B1F3A]/35 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-20px_rgba(11,31,58,.45)]" onClick={(e) => e.stopPropagation()}>
        {/* 🌿 a thin mint → sky strip, the Feed's colours */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#14B88F] to-[#2C9BEA]" />
        <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-black tracking-tight text-[#0F2F2A]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-[13px] font-bold text-[#64748B] hover:bg-[#E2E8F0]">✕</button>
        </div>
        <div className="relative mt-3">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, maxLen))}
            placeholder={placeholder}
            className="h-24 w-full resize-none rounded-2xl border border-[#D7EFE7] bg-gradient-to-b from-[#F6FFFC] to-[#EEF9FF] p-3 pb-6 text-[15px] leading-6 text-[#0F2F2A] outline-none transition placeholder:text-[#8AA79F] focus:border-[#14B88F] focus:ring-4 focus:ring-[#14B88F]/15"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] font-bold tabular-nums text-[#8AA79F]">{caption.length}/{maxLen}</span>
        </div>
        {allowPhoto && (
          <div className="mt-3">
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f || !uid) return;
                setPhotoBusy(true);
                try {
                  setPhotoUrl(await uploadChatImage(`blog_stories/${uid}`, f));
                } catch (err) {
                  setSongErr(err instanceof Error ? err.message : "Could not add the photo.");
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
            {photoUrl ? (
              <div className="relative overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Story photo" className="h-36 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[13px] font-bold text-white backdrop-blur"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => photoInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#14B88F]/60 bg-[#F3FFFA] py-3 text-[13px] font-extrabold text-[#0E7A62] transition hover:bg-[#E8FBF4] disabled:opacity-50"
              >
                <span aria-hidden>📷</span>
                {photoBusy ? "Adding photo…" : "Add a photo"}
              </button>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-[#F1F6F4] p-1">
          {([["everyone", "🌍 Everyone"], ["friends", "👥 Friends"], ["only_me", "🔒 Only me"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAudience(k)}
              aria-pressed={audience === k}
              className={`rounded-xl py-2 text-[12.5px] font-extrabold transition ${audience === k ? "bg-white text-[#0E7A62] shadow-[0_2px_8px_-2px_rgba(14,122,98,.35)]" : "text-[#6B7B76] hover:text-[#0F2F2A]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          ref={songInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !uid) return;
            setSongErr("");
            setSongBusy(true);
            try {
              const up = await uploadStorySong(uid, f);
              setSong({ url: up.url, title: up.title, startSec: 0 });
            } catch (err) {
              setSongErr(err instanceof Error ? err.message : "Could not add the song.");
            } finally {
              setSongBusy(false);
            }
          }}
        />
        <div className="mt-3">
          {song ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[#F4F6FD] px-3 py-2 text-[13px] font-bold text-[#1E1B4B]">
              <span>🎵</span>
              <span className="min-w-0 flex-1 truncate">{song.title}</span>
              <span className="text-[11px] text-[#6B6F9A]">first {STORY_SONG_SECONDS} sec</span>
              <button type="button" onClick={() => setSong(null)} aria-label="Remove song" className="text-[#8494B2]">✕</button>
            </div>
          ) : (
            <button
              type="button"
              disabled={songBusy}
              onClick={() => songInput.current?.click()}
              className="rounded-full bg-[#EEF0FF] px-3.5 py-1.5 text-[12.5px] font-extrabold text-[#4F46E5] disabled:opacity-50"
            >
              {songBusy ? "🎵 Adding song…" : "🎵 Add a song"}
            </button>
          )}
          {!song && (
            <button
              type="button"
              onClick={async () => {
                setShowLib((v) => !v);
                if (library === null) setLibrary(await loadSongLibrary().catch(() => []));
              }}
              className="ml-2 rounded-full bg-[#F1EFFF] px-3.5 py-1.5 text-[12.5px] font-extrabold text-[#4F46E5]"
            >
              🎼 Library
            </button>
          )}
          {showLib && !song && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-[#E5EAF5] bg-white p-1.5">
              {library === null && <p className="px-2 py-2 text-[12.5px] text-[#6B6F9A]">Loading…</p>}
              {library !== null && library.length === 0 && <p className="px-2 py-2 text-[12.5px] text-[#6B6F9A]">No songs in the library yet.</p>}
              {(library || []).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setSong({ url: x.url, title: x.artist ? `${x.title} · ${x.artist}` : x.title, startSec: 0 });
                    setShowLib(false);
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-[#F4F6FD]"
                >
                  <span className="block text-[13.5px] font-bold text-[#1E1B4B]">🎵 {x.title}</span>
                  <span className="block text-[11.5px] text-[#6B6F9A]">{[x.artist, x.category].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
          {songErr && <p className="mt-1 text-[12px] text-[#B91C1C]">{songErr}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 font-bold text-[#4F46E5]">Cancel</button>
          <button
            type="button"
            disabled={!canShare || photoBusy}
            onClick={() => onConfirm(caption.trim(), audience, song, photoUrl)}
            className="rounded-full bg-gradient-to-r from-[#14B88F] to-[#2C9BEA] px-6 py-2.5 font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(20,184,143,.8)] transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#D9E2E0] disabled:text-[#8AA79F] disabled:shadow-none"
          >
            {confirmText}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
