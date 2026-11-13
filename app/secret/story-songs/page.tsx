"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { r2Upload } from "../../../lib/r2Upload";
import { functions, storage } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { blogCall } from "../../../lib/feed";

// the story song length, and the library entry shape (same as lib/songUpload.ts)
const STORY_SONG_SECONDS = 30;
type LibrarySong = { id: string; title: string; artist: string; category: string; url: string };
import { FounderShell, card, input } from "../_Shell";

// 🎼 Story song library (miGlife only): add a song that people can pick for their story.
// Use only music you have the right to use (licensed or public domain). A story plays
// the first 30 seconds, so upload a 30-second clip.

const addLibrarySong = httpsCallable<{ title: string; artist: string; category: string; url: string }, { ok: boolean; id: string }>(
  functions,
  "addLibrarySong"
);
const MAX_BYTES = 6 * 1024 * 1024;
const CATEGORIES = ["Happy", "Calm", "Romantic", "Sad", "Party", "Nature"];

function durationOf(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? a.duration : 0);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    a.src = url;
  });
}

export default function StorySongsPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [file, setFile] = useState<File | null>(null);
  const [secs, setSecs] = useState(0);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [category, setCategory] = useState("Happy");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [library, setLibrary] = useState<LibrarySong[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = () =>
    blogCall("songs")
      .then((r) => setLibrary((Array.isArray(r.songs) ? r.songs : []) as LibrarySong[]))
      .catch(() => setLibrary([]));
  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  const pick = async (f2: File | undefined) => {
    setMsg("");
    if (!f2) return;
    if (f2.size > MAX_BYTES) return setMsg("That file is over 6 MB. Please trim it to 30 seconds first.");
    setFile(f2);
    setTitle((t) => t || f2.name.replace(/\.[^.]+$/, "").slice(0, 60));
    setSecs(Math.round(await durationOf(f2)));
  };

  const add = async () => {
    if (!file || !title.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      // ☁️ R2 first; Firebase Storage when R2 is not set up
      let url = await r2Upload("song_library", file, file.type || "audio/mpeg");
      if (!url) {
        const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "mp3";
        const r = ref(storage, `blog_music_library/${crypto.randomUUID()}.${ext || "mp3"}`);
        await uploadBytes(r, file, { contentType: file.type || "audio/mpeg" });
        url = await getDownloadURL(r);
      }
      await addLibrarySong({ title: title.trim(), artist: artist.trim(), category, url });
      setFile(null);
      setTitle("");
      setArtist("");
      setSecs(0);
      setMsg("Added to the library ✓");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not add the song.");
    } finally {
      setBusy(false);
    }
  };

  const preview = (s: LibrarySong) => {
    const a = new Audio(s.url);
    a.currentTime = 0;
    a.play().catch(() => {});
    setPlaying(s.id);
    a.onended = () => setPlaying(null);
    window.setTimeout(() => {
      a.pause();
      setPlaying(null);
    }, STORY_SONG_SECONDS * 1000);
  };

  return (
    <FounderShell title="🎼 Story songs" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          People pick these for their story. A story plays the first {STORY_SONG_SECONDS} seconds, so use a {STORY_SONG_SECONDS}-second clip.
          Add only music you have the right to use (licensed or public domain).
        </p>
        <label className="block">
          <span className="text-sm font-bold">Audio file (MP3, M4A, AAC, OGG or WAV, up to 6 MB)</span>
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav"
            onChange={(e) => pick(e.target.files?.[0])}
            className="mt-1 block w-full text-sm"
          />
        </label>
        {file && (
          <p className={`text-xs ${secs > STORY_SONG_SECONDS ? "text-[#B45309]" : "text-[#5B6B8C]"}`}>
            {file.name} · {secs} sec{secs > STORY_SONG_SECONDS ? ` — only the first ${STORY_SONG_SECONDS} seconds will play` : ""}
          </p>
        )}
        <input className={input} placeholder="Title" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={input} placeholder="Artist (optional)" maxLength={60} value={artist} onChange={(e) => setArtist(e.target.value)} />
        <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !file || !title.trim()}
          onClick={add}
          className="w-full rounded-xl bg-[#2F80ED] px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add to the library"}
        </button>
        {msg && <p className="text-sm text-[#1F2A44]">{msg}</p>}
      </div>

      <div className={`${card} mt-4 space-y-2`}>
        <p className="text-sm font-bold">In the library ({library?.length ?? 0})</p>
        {library === null && <p className="text-xs text-[#5B6B8C]">Loading…</p>}
        {(library || []).map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl border border-[#E5EAF5] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{s.title}</div>
              <div className="truncate text-xs text-[#5B6B8C]">{[s.artist, s.category].filter(Boolean).join(" · ")}</div>
            </div>
            <button type="button" onClick={() => preview(s)} className="rounded-full bg-[#EEF0FF] px-3 py-1.5 text-xs font-bold text-[#4F46E5]">
              {playing === s.id ? "Playing…" : "▶ 30 sec"}
            </button>
          </div>
        ))}
      </div>
    </FounderShell>
  );
}
