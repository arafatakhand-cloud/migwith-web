"use client";

import { useEffect, useRef, useState } from "react";
import { PROFILE_SONGS, playProfileSong, stopProfileSong, type ProfileSong } from "../../lib/profileSongs";

// 🎵 DEMO ONLY (not linked anywhere): Profile Theme Songs — hear every tune,
// see the shop cards and how a profile shows its song.

function Eq({ on, color }: { on: boolean; color: string }) {
  return (
    <span className="inline-flex h-4 items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <i
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            background: color,
            height: on ? undefined : 4,
            animation: on ? `songEq .${5 + i}s ease-in-out ${i * 0.08}s infinite alternate` : undefined,
          }}
        />
      ))}
    </span>
  );
}

export default function ProfileSongDemo() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [mine, setMine] = useState<ProfileSong>(PROFILE_SONGS[0]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const play = (s: ProfileSong) => {
    if (timer.current) clearTimeout(timer.current);
    if (playing === s.id) {
      stopProfileSong();
      setPlaying(null);
      return;
    }
    const ms = playProfileSong(s);
    setPlaying(s.id);
    timer.current = setTimeout(() => setPlaying(null), ms + 200);
  };
  useEffect(() => () => stopProfileSong(), []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#D6ECFB] via-[#E3EEFB] to-[#EDE4F6] px-3 pb-16 pt-4 text-[#0B2A5B]">
      <style>{`@keyframes songEq{from{height:3px}to{height:16px}}`}</style>
      <p className="mx-1 text-[11px] font-black tracking-[1.3px] text-[#35507E]">DEMO · PROFILE THEME SONGS</p>
      <h1 className="mx-1 mt-1 text-2xl font-black">🎵 Profile Songs</h1>
      <p className="mx-1 mt-1 text-[13px] text-[#5B6B8C]">A 5-second tune plays when someone opens your profile. 30 days, paid in coins. Tap ▶ to listen.</p>

      {/* 1 · how a profile looks with a song */}
      <p className="mx-1 mt-5 text-[11px] font-black tracking-[1.3px] text-[#35507E]">1 · ON A PROFILE</p>
      <div className="mt-2 overflow-hidden rounded-3xl border-[1.5px] border-white bg-white" style={{ boxShadow: "0 5px 0 #b9cdee, 0 16px 30px rgba(40,80,160,.16)" }}>
        <div className="h-20" style={{ background: `linear-gradient(135deg, ${mine.colors[0]}, ${mine.colors[1]})` }} />
        <div className="-mt-10 flex items-end gap-3 px-4">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-[#EEF4FF] text-3xl">🙂</span>
          <div className="pb-1">
            <p className="text-lg font-black">sabuj</p>
            <p className="text-xs text-[#5B6B8C]">Level 26 · Bangladesh</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => play(mine)}
          className="mx-4 my-4 flex w-[calc(100%-32px)] items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left"
          style={{ background: `${mine.colors[0]}22`, border: `1.5px solid ${mine.colors[0]}66` }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-white" style={{ background: `linear-gradient(135deg, ${mine.colors[0]}, ${mine.colors[1]})` }}>
            {playing === mine.id ? "❚❚" : "▶"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-[#5B6B8C]">Theme song</span>
            <span className="block text-sm font-black">
              {mine.emoji} {mine.name}
            </span>
          </span>
          <Eq on={playing === mine.id} color={mine.colors[1]} />
          <span className="ml-1 text-lg" title="Mute">🔈</span>
        </button>
      </div>
      <p className="mx-1 mt-1.5 text-[11px] text-[#7F8FB0]">Plays once when the profile opens · 🔈 mutes songs for you · pick a song below to see it here</p>

      {/* 2 · the shop */}
      <p className="mx-1 mt-5 text-[11px] font-black tracking-[1.3px] text-[#35507E]">2 · THE SHOP</p>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        {PROFILE_SONGS.map((s) => {
          const on = playing === s.id;
          return (
            <div
              key={s.id}
              className="rounded-3xl border-[1.5px] border-white bg-white p-3"
              style={{ boxShadow: `0 4px 0 ${s.colors[0]}88, 0 12px 24px rgba(40,80,160,.12)` }}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl" style={{ background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})`, boxShadow: `0 3px 0 ${s.colors[1]}` }}>
                  {s.emoji}
                </span>
                <Eq on={on} color={s.colors[1]} />
              </div>
              <p className="mt-2 text-[15px] font-black leading-5">{s.name}</p>
              <p className="text-[11px] text-[#5B6B8C]">{s.mood}</p>
              <p className="mt-1 text-[12px] font-black" style={{ color: s.colors[1] }}>
                🪙 {s.price.toLocaleString("en-US")} · 30 days
              </p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={() => play(s)} className="h-9 flex-1 rounded-xl border-[1.5px] text-[13px] font-black" style={{ borderColor: s.colors[0], color: s.colors[1] }}>
                  {on ? "■ Stop" : "▶ Play"}
                </button>
                <button
                  type="button"
                  onClick={() => setMine(s)}
                  className="h-9 flex-1 rounded-xl text-[13px] font-black text-white"
                  style={{ background: `linear-gradient(180deg,rgba(255,255,255,.3),transparent 50%),linear-gradient(${s.colors[0]},${s.colors[1]})` }}
                >
                  {mine.id === s.id ? "✓ On" : "Use"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
