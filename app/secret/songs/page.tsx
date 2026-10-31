"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { PROFILE_SONGS, playProfileSong, stopProfileSong, type ProfileSong } from "../../../lib/profileSongs";
import { useCustomSongs, useSongPrices } from "../../_components/ProfileSongs";
import { FounderShell, card, input } from "../_Shell";

// 🎤 Profile Songs — miglife uploads ANY music (up to 5 minutes, 7 MB) as a
// Profile Song. It shows in Explore › Profile Songs › 🎤 miGlife and is bought /
// switched on like the built-in tunes (founderProfileSong on the server).

const call = httpsCallable<Record<string, unknown>, { ok?: boolean; id?: string }>(functions, "founderProfileSong");
const editBuiltIn = httpsCallable<{ kind: "song"; id: string; name: string; price: number }, { ok?: boolean }>(functions, "founderEditShopItem");
const MAX_SECONDS = 300;
const MAX_BYTES = 7 * 1024 * 1024;

// The song's length. Some phones never finish reading it (the page used to wait
// for ever and nothing happened), and some files report "Infinity" — then it is
// worked out from the file size (a 128 kbps MP3 is ~16 KB a second).
// -1 = the phone can't play this file at all.
function audioSeconds(file: File): Promise<number> {
  const guess = () => Math.max(1, Math.round(file.size / 16_000));
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    let done = false;
    const finish = (v: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => finish(guess()), 6000);
    a.preload = "metadata";
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : guess());
    a.onerror = () => finish(-1);
    a.src = url;
    a.load();
  });
}

// The type the server accepts, from the file's own type or its name
// (phones often give "audio/x-wav", "audio/opus" … or nothing at all).
function audioType(file: File): string | null {
  const t = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (t === "audio/mpeg" || t === "audio/mp3" || ext === "mp3") return "audio/mpeg";
  if (t === "audio/mp4" || t === "audio/x-m4a" || t === "audio/m4a" || ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (t === "audio/aac" || t === "audio/x-aac" || ext === "aac") return "audio/aac";
  if (t === "audio/ogg" || t === "audio/opus" || ext === "ogg" || ext === "oga" || ext === "opus") return "audio/ogg";
  if (t === "audio/wav" || t === "audio/x-wav" || t === "audio/wave" || t === "audio/vnd.wave" || ext === "wav") return "audio/wav";
  if (t === "audio/webm" || ext === "webm") return "audio/webm";
  return null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function SongsPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const songs = useCustomSongs() as (ProfileSong & { hidden?: boolean })[];
  const [file, setFile] = useState<File | null>(null);
  const [secs, setSecs] = useState(0);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎵");
  const [mood, setMood] = useState("");
  const [price, setPrice] = useState("150000");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const prices = useSongPrices();
  const [tab, setTab] = useState<"Happy" | "Sad" | "Flute">("Sad");

  const pick = async (fl: File | null) => {
    setMsg(null);
    setFile(null);
    setSecs(0);
    if (!fl) return;
    if (fl.size > MAX_BYTES) return setMsg({ text: `The file is ${(fl.size / 1048576).toFixed(1)} MB — the most is 7 MB. Save it as a 128 kbps MP3.`, bad: true });
    if (!audioType(fl)) return setMsg({ text: `"${fl.name}" is not a music file this can use — please choose an MP3, M4A, AAC, OGG or WAV.`, bad: true });
    setMsg({ text: "⏳ Reading the song…", bad: false });
    const d = await audioSeconds(fl);
    setMsg(null);
    if (d < 0) return setMsg({ text: "This file can't be played — please choose an MP3 or M4A song.", bad: true });
    if (d > MAX_SECONDS + 0.5) return setMsg({ text: `The song is ${mmss(d)} long — the most is 5:00. Cut it shorter and try again.`, bad: true });
    setFile(fl);
    setSecs(d);
    if (!name) setName(fl.name.replace(/\.[^.]+$/, "").slice(0, 30));
  };

  const upload = async () => {
    if (!file) return setMsg({ text: "Choose a music file first.", bad: true });
    if (!name.trim()) return setMsg({ text: "Give the song a name.", bad: true });
    setBusy(true);
    setMsg(null);
    try {
      const fileBase64 = await toBase64(file);
      await call({
        action: "add",
        name: name.trim(),
        emoji,
        mood: mood.trim(),
        price: Math.floor(Number(price)),
        seconds: Math.round(secs),
        contentType: audioType(file) || "audio/mpeg",
        fileBase64,
      });
      setMsg({ text: `✅ "${name.trim()}" is in the shop now (Profile Songs › 🎤 miGlife).`, bad: false });
      setFile(null);
      setSecs(0);
      setName("");
      setMood("");
    } catch (e: any) {
      setMsg({ text: e?.message || "Upload failed.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  const update = async (s: ProfileSong, patch: Record<string, unknown>) => {
    try {
      await call({ action: "update", id: s.id, ...patch });
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", bad: true });
    }
  };

  const editPrice = async (s: ProfileSong) => {
    const cur = prices[s.id] || s.price;
    const p = window.prompt(`New price for "${s.name}" (coins, 30 days)`, String(cur));
    if (!p) return;
    const price = Math.floor(Number(p.replace(/\D/g, "")));
    if (!price || price < 1000 || price > 100000000) return setMsg({ text: "Price: a whole number from 1,000 to 100,000,000.", bad: true });
    try {
      await editBuiltIn({ kind: "song", id: s.id, name: s.name, price });
      setMsg({ text: `✅ "${s.name}" now costs 🪙 ${price.toLocaleString("en-US")}.`, bad: false });
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", bad: true });
    }
  };

  const play = (s: ProfileSong) => {
    if (playing === s.id) {
      stopProfileSong();
      setPlaying(null);
      return;
    }
    playProfileSong(s);
    setPlaying(s.id);
  };

  return (
    <FounderShell title="🎤 Profile Songs" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          Add any song (up to 5 minutes, 7 MB). It shows in Explore › Profile Songs › 🎤 miGlife, bought for 30 days like the others. Only upload music
          you have the right to use.
        </p>
        <label className="block">
          <span className="text-sm font-bold">Music file</span>
          {/* the file types too, not only audio/*: some phones' pickers hide songs saved by other apps */}
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.webm"
            onChange={(e) => pick(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-[#8B4DFF] file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
          />
        </label>
        {file && (
          <p className="text-xs font-bold text-[#1E8C4E]">
            ✓ {file.name} · {mmss(secs)} · {(file.size / 1048576).toFixed(1)} MB
          </p>
        )}
        <div className="flex gap-2">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 8))} className={`${input} max-w-[70px] text-center`} aria-label="Emoji" />
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder="Song name" className={input} />
        </div>
        <input value={mood} onChange={(e) => setMood(e.target.value.slice(0, 40))} placeholder="Short line — e.g. A sad Bangla song" className={input} />
        <label className="flex items-center gap-2 text-sm font-semibold">
          Price (coins, 30 days)
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" className={`${input} max-w-[160px]`} />
        </label>
        <button type="button" onClick={upload} disabled={busy || !file} className="w-full rounded-xl bg-[#8B4DFF] py-3 text-sm font-black text-white disabled:opacity-50">
          {busy ? "Uploading…" : "⬆ Upload song"}
        </button>
        {!file && !busy && !msg && <p className="text-center text-xs text-[#5B6B8C]">Choose a music file first — the button turns on after that.</p>}
        {msg && <p className={`text-sm font-bold ${msg.bad ? "text-rose-600" : "text-[#1E8C4E]"}`}>{msg.text}</p>}
      </div>

      <div className={`${card} mt-3`}>
        <p className="font-bold">🎤 My songs ({songs.length})</p>
        {songs.length === 0 && <p className="mt-2 text-sm text-[#5B6B8C]">No songs yet.</p>}
        <ul className="mt-2 space-y-2">
          {songs.map((s) => (
            <li key={s.id} className={`rounded-xl border border-[#E1E9F5] p-2.5 ${s.hidden ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{s.name}</span>
                  <span className="block text-[11px] text-[#5B6B8C]">
                    {mmss(s.seconds || 0)} · 🪙 {s.price.toLocaleString("en-US")} · {s.hidden ? "hidden" : "in the shop"}
                  </span>
                </span>
                <button type="button" onClick={() => play(s)} className="rounded-lg bg-[#EEF3FA] px-2.5 py-1.5 text-xs font-bold text-[#174EA6]">
                  {playing === s.id ? "■" : "▶"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = window.prompt("New price (coins)", String(s.price));
                    if (p) update(s, { price: Math.floor(Number(p.replace(/\D/g, ""))) });
                  }}
                  className="rounded-lg bg-[#EEF3FA] px-2.5 py-1.5 text-xs font-bold text-[#174EA6]"
                >
                  💲
                </button>
                <button
                  type="button"
                  onClick={() => update(s, { on: !!s.hidden })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${s.hidden ? "bg-[#1E8C4E] text-white" : "bg-[#FDECEC] text-[#C62828]"}`}
                >
                  {s.hidden ? "Show" : "Hide"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-[#5B6B8C]">Hide removes a song from the shop. People who already bought it keep it until their 30 days end.</p>
      </div>
      <div className={`${card} mt-3`}>
        <p className="font-bold">🎵 Built-in songs — price</p>
        <div className="mt-2 flex gap-2">
          {(["Happy", "Sad", "Flute"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${tab === t ? "bg-[#8B4DFF] text-white" : "bg-[#EEF3FA] text-[#174EA6]"}`}
            >
              {t === "Flute" ? "🪈 Bansuri" : t}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-2">
          {PROFILE_SONGS.filter((s) => s.category === tab).map((s) => {
            const edited = prices[s.id];
            return (
              <li key={s.id} className="flex items-center gap-2 rounded-xl border border-[#E1E9F5] p-2.5">
                <span className="text-2xl">{s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{s.name}</span>
                  <span className="block text-[11px] text-[#5B6B8C]">
                    🪙 {(edited || s.price).toLocaleString("en-US")}
                    {edited && edited !== s.price ? ` (was ${s.price.toLocaleString("en-US")})` : ""}
                  </span>
                </span>
                <button type="button" onClick={() => play(s)} className="rounded-lg bg-[#EEF3FA] px-2.5 py-1.5 text-xs font-bold text-[#174EA6]">
                  {playing === s.id ? "■" : "▶"}
                </button>
                <button type="button" onClick={() => editPrice(s)} className="rounded-lg bg-[#EEF3FA] px-2.5 py-1.5 text-xs font-bold text-[#174EA6]">
                  💲
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-[#5B6B8C]">The new price shows in the shop on the web and in the app right away. People who already bought a song keep it.</p>
      </div>
    </FounderShell>
  );
}
