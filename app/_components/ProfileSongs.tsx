"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { serverNow } from "../../lib/serverTime";
import { PROFILE_SONGS, customSong, playProfileSong, songSeconds, stopProfileSong, type ProfileSong } from "../../lib/profileSongs";

// 🎵 Profile Theme Songs (the app's ProfileSongs.kt): buy a 15-second tune for
// 30 days (buyProfileSong); the one that is on (setProfileSong) plays once when
// someone opens your profile. Only the Cloud Functions write:
//   entry_fx/{uid}                        { songs: {id: expiresAtMs}, songActive }
//   entry_fx_public/song_{usernameLower}  { active, expiresAt }

export const songById = (id: string) => PROFILE_SONGS.find((s) => s.id === id) || null;

/** 🎤 miglife's uploaded songs (all of them, hidden ones too — someone may own one). */
export function useCustomSongs(): ProfileSong[] {
  const [list, setList] = useState<ProfileSong[]>([]);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "shop_overrides"),
        (d) => {
          const cat = (d.get("songCatalog") || {}) as Record<string, Record<string, unknown>>;
          setList(
            Object.entries(cat)
              .filter(([, v]) => v && v.url)
              .map(([id, v]) => ({ ...customSong(id, v), hidden: v.on === false }) as ProfileSong & { hidden?: boolean })
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          );
        },
        () => {}
      ),
    []
  );
  return list;
}
const opId = () => "song_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);

// 🔈 "no profile songs for me" — this device only
const MUTE_KEY = "migwith.profileSongMute";
const isMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};
const setMuted = (on: boolean) => {
  try {
    localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {}
};

function Eq({ on, color }: { on: boolean; color: string }) {
  return (
    <span className="inline-flex h-4 items-end gap-[2px]">
      <style>{`@keyframes songEq{from{height:3px}to{height:16px}}`}</style>
      {[0, 1, 2, 3].map((i) => (
        <i
          key={i}
          className="w-[3px] rounded-sm"
          style={{ background: color, height: on ? undefined : 4, animation: on ? `songEq .${5 + i}s ease-in-out ${i * 0.08}s infinite alternate` : undefined }}
        />
      ))}
    </span>
  );
}

/** Plays a song and says when it has finished. */
function usePlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
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
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    stopProfileSong();
    setPlaying(null);
  };
  useEffect(() => () => stopProfileSong(), []);
  return { playing, play, stop };
}

/** 🎵 On a profile: the song that is on, played once when the profile opens. */
export function ProfileSongChip({ username, classic }: { username: string; classic?: boolean }) {
  const [song, setSong] = useState<ProfileSong | null>(null);
  const [muted, setMutedState] = useState(false);
  const { playing, play, stop } = usePlayer();
  const autoPlayed = useRef("");

  useEffect(() => {
    setSong(null);
    if (!username) return;
    let alive = true;
    getDoc(doc(db, "entry_fx_public", `song_${username.trim().toLowerCase()}`))
      .then((d) => {
        if (!alive) return;
        const id = String(d.get("active") || "none");
        const ends = Number(d.get("expiresAt") || 0);
        if (id === "none" || ends <= serverNow()) return setSong(null);
        const built = songById(id);
        if (built) return setSong(built);
        // 🎤 one of miglife's uploaded songs
        getDoc(doc(db, "app_settings", "shop_overrides"))
          .then((o) => {
            const v = ((o.get("songCatalog") || {}) as Record<string, Record<string, unknown>>)[id];
            if (alive && v && v.url) setSong(customSong(id, v));
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [username]);

  // ▶ once per profile open, unless songs are muted on this device (a browser
  // may block sound before the first tap — then ▶ plays it)
  useEffect(() => {
    setMutedState(isMuted());
    if (!song || autoPlayed.current === `${username}|${song.id}` || isMuted()) return;
    autoPlayed.current = `${username}|${song.id}`;
    play(song);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, username]);

  if (!song) return null;
  const on = playing === song.id;
  return (
    <div
      className={`mt-2 flex items-center gap-2.5 px-3 py-2 ${classic ? "rounded-[6px]" : "rounded-2xl"}`}
      style={{ background: `${song.colors[0]}26`, border: `1.5px solid ${song.colors[0]}88` }}
    >
      <button
        type="button"
        onClick={() => play(song)}
        aria-label={on ? "Stop" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base text-white"
        style={{ background: `linear-gradient(135deg, ${song.colors[0]}, ${song.colors[1]})` }}
      >
        {on ? "❚❚" : "▶"}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold opacity-75">Theme song</span>
        <span className="block truncate text-sm font-black">
          {song.emoji} {song.name}
        </span>
      </span>
      <Eq on={on} color={song.colors[1]} />
      <button
        type="button"
        title={muted ? "Profile songs are off for you — tap to turn on" : "Turn profile songs off for me"}
        onClick={() => {
          const next = !muted;
          setMuted(next);
          setMutedState(next);
          if (next) stop();
        }}
        className="ml-1 text-lg"
      >
        {muted ? "🔇" : "🔈"}
      </button>
    </div>
  );
}

/** 🎵 Explore › Profile Songs: listen, buy (+30 days), turn one on / off. */
export function ProfileSongShop({ uid }: { uid: string }) {
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [active, setActive] = useState("none");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ProfileSong | null>(null);
  const [tab, setTab] = useState<"All" | "Happy" | "Sad" | "Flute" | "miGlife">("All");
  const { playing, play } = usePlayer();
  const custom = useCustomSongs() as (ProfileSong & { hidden?: boolean })[];
  const ALL = [...PROFILE_SONGS, ...custom.filter((s) => !s.hidden)];
  const byId = (id: string) => songById(id) || custom.find((s) => s.id === id) || null;
  const now = serverNow();

  useEffect(
    () =>
      onSnapshot(
        doc(db, "entry_fx", uid),
        (d) => {
          setOwned((d.get("songs") as Record<string, number>) || {});
          setActive(String(d.get("songActive") || "none"));
        },
        () => {}
      ),
    [uid]
  );
  useEffect(() => onSnapshot(doc(db, "users", uid), (d) => setBalance(Number(d.get("balance") || 0)), () => {}), [uid]);

  const daysLeft = (id: string) => Math.max(0, Math.ceil(((owned[id] || 0) - now) / 86_400_000));
  const use = async (id: string) => {
    setBusy(id);
    try {
      await httpsCallable(functions, "setProfileSong")({ id });
      setActive(id);
      const s = byId(id);
      setMessage(id === "none" || !s ? "Profile song turned off." : `✓ ${s.emoji} ${s.name} plays on your profile now.`);
    } catch (e: any) {
      setMessage(e?.message || "Could not change.");
    } finally {
      setBusy(null);
    }
  };
  const buy = async (s: ProfileSong) => {
    setConfirm(null);
    setBusy(s.id);
    try {
      await httpsCallable(functions, "buyProfileSong")({ id: s.id, operationId: opId() });
      setMessage(`${s.emoji} ${s.name} is yours for 30 days!`);
    } catch (e: any) {
      setMessage(e?.message || "Purchase failed.");
    } finally {
      setBusy(null);
    }
  };

  const mine = [...PROFILE_SONGS, ...custom].filter((s) => (owned[s.id] || 0) > now);
  return (
    <div>
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="font-semibold text-[#35507E]">Plays when someone opens your profile</span>
        <span className="rounded-full bg-[#12324F] px-[9px] py-1 text-[11px] font-bold text-[#6FE0A0]">💲 {balance === null ? "…" : balance.toLocaleString("en-US")}</span>
      </div>
      {message && <p className="mt-2 px-1 text-[12px] font-bold text-[#0B2A5B]">{message}</p>}

      {mine.length > 0 && (
        <div className="mt-2.5 rounded-2xl bg-[#FDF6E3] p-2.5">
          <p className="text-[13px] font-bold text-[#7A5B00]">🏅 My Profile Songs</p>
          <p className="text-[10px] text-[#8A8060]">Only one plays at a time.</p>
          <ul className="mt-1.5 space-y-1.5">
            {mine.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id} className="flex items-center rounded-xl border bg-white p-2" style={{ borderColor: `${s.colors[0]}99` }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg" style={{ background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})` }}>
                    {s.emoji}
                  </span>
                  <span className="ml-2 min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-bold text-[#1A1A2E]">{s.name}</span>
                      {on && <span className="rounded-md bg-[#2E9E6B] px-[5px] py-px text-[8px] font-black text-white">ON</span>}
                    </span>
                    <span className="text-[10px] text-[#8A8060]">⏳ {daysLeft(s.id)} days left</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => use(on ? "none" : s.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-50 ${on ? "bg-[#EEF1F5] text-[#5B6B8C]" : "bg-[#2E9E6B] text-white"}`}
                  >
                    {on ? "Turn off" : "Turn on"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 😊 / 😢 tabs */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["All", "Happy", "Sad", "Flute", "miGlife"] as const).filter((t) => t !== "miGlife" || ALL.some((s) => s.category === "miGlife")).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ${tab === t ? "bg-[#1E63D6] text-white" : "bg-white text-[#35507E]"}`}
          >
            {t === "Happy" ? "😊 Happy" : t === "Sad" ? "😢 Sad" : t === "Flute" ? "🪈 Bansuri" : t === "miGlife" ? "🎤 miGlife" : "All"} ({t === "All" ? ALL.length : ALL.filter((s) => s.category === t).length})
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {ALL.filter((s) => tab === "All" || s.category === tab).map((s) => {
          const on = playing === s.id;
          const have = (owned[s.id] || 0) > now;
          return (
            <div key={s.id} className="rounded-3xl border-[1.5px] border-white bg-white p-3 text-[#0B2A5B]" style={{ boxShadow: `0 4px 0 ${s.colors[0]}88, 0 12px 24px rgba(40,80,160,.12)` }}>
              <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl" style={{ background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})`, boxShadow: `0 3px 0 ${s.colors[1]}` }}>
                  {s.emoji}
                </span>
                <Eq on={on} color={s.colors[1]} />
                {have && <span className="ml-auto rounded-md bg-[#2E9E6B] px-1.5 py-px text-[9px] font-black text-white">{daysLeft(s.id)}d</span>}
              </div>
              <p className="mt-2 text-[15px] font-black leading-5">{s.name}</p>
              <p className="text-[11px] text-[#5B6B8C]">{s.mood} · {songSeconds(s)} s</p>
              <p className="mt-1 text-[12px] font-black" style={{ color: s.colors[1] }}>
                🪙 {s.price.toLocaleString("en-US")} · 30 days
              </p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={() => play(s)} className="h-9 flex-1 rounded-xl border-[1.5px] text-[13px] font-black" style={{ borderColor: s.colors[0], color: s.colors[1] }}>
                  {on ? "■ Stop" : "▶ Play"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirm(s)}
                  className="h-9 flex-1 rounded-xl text-[13px] font-black text-white disabled:opacity-50"
                  style={{ background: `linear-gradient(180deg,rgba(255,255,255,.3),transparent 50%),linear-gradient(${s.colors[0]},${s.colors[1]})` }}
                >
                  {busy === s.id ? "…" : have ? "+30 days" : "Buy"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-6" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[320px] rounded-3xl bg-white p-5 text-center text-[#0B2A5B]" onClick={(e) => e.stopPropagation()}>
            <p className="text-4xl">{confirm.emoji}</p>
            <p className="mt-2 text-lg font-black">{confirm.name}</p>
            <p className="mt-1 text-sm text-[#5B6B8C]">
              {(owned[confirm.id] || 0) > now ? "Add 30 more days" : "30 days"} for 🪙 {confirm.price.toLocaleString("en-US")} coins?
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-2xl bg-[#EEF1F5] font-black text-[#5B6B8C]">
                Cancel
              </button>
              <button type="button" onClick={() => buy(confirm)} className="h-11 flex-1 rounded-2xl font-black text-white" style={{ background: `linear-gradient(${confirm.colors[0]},${confirm.colors[1]})` }}>
                Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
