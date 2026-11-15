"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";

// Explore › Lucky User, like the app: lucky_rounds (written only by the
// luckyUserTick function) — the current winner (pink until the next one), MY
// own Lucky points (lucky_live, only mine), and the previous winners. The pick
// comes at a random time every few hours, so there is no countdown.

type Live = { room: string; level: number; firstTimer: boolean; eligible: boolean; winsWeek: number };
const LEVELS = ["Low", "Good", "Very good", "Great"];
const LEVEL_ICON = ["🌱", "🙂", "🔥", "🌟"];
const LEVEL_FILL = ["#FF9AC8", "#FF7AB8", "#E84E9A", "#D6338A"];

type Round = { uid: string; username: string; windowEnd: number; coins: number };

export default function LuckyUserPage() {
  const ready = useRequireLogin();
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [photo, setPhoto] = useState("");
  // 🍀 Smart Lucky User settings + my own live points
  const [luckyRooms, setLuckyRooms] = useState<string[]>(["Bangladesh"]);
  const [luckyCoins, setLuckyCoins] = useState(5000);
  const [maxHours, setMaxHours] = useState(5);
  const [live, setLive] = useState<Record<string, Live>>({});
  useEffect(() => {
    if (!ready) return;
    return onSnapshot(doc(db, "app_settings", "lucky_user"), (s) => {
      const r = s.get("rooms");
      if (Array.isArray(r) && r.length) setLuckyRooms(r.map(String));
      if (typeof s.get("coins") === "number") setLuckyCoins(s.get("coins"));
      if (typeof s.get("maxHours") === "number") setMaxHours(s.get("maxHours"));
    }, () => {});
  }, [ready]);
  const myUid = auth.currentUser?.uid;
  useEffect(() => {
    if (!ready || !myUid) return;
    const offs = luckyRooms.map((room) =>
      onSnapshot(doc(db, "lucky_live", room, "users", myUid), (s) => {
        setLive((o) => {
          const n = { ...o };
          if (s.exists()) n[room] = s.data() as Live;
          else delete n[room];
          return n;
        });
      }, () => {})
    );
    return () => offs.forEach((o) => o());
  }, [ready, myUid, luckyRooms]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    return onSnapshot(
      query(collection(db, "lucky_rounds"), orderBy("windowEnd", "desc"), limit(30)),
      (snap) => {
        setError("");
        setRounds(
          snap.docs
            .filter((d) => typeof d.get("uid") === "string" && d.get("uid"))
            .map((d) => ({
              uid: String(d.get("uid")),
              username: String(d.get("username") || ""),
              windowEnd: Number(d.get("windowEnd") || 0),
              coins: Number(d.get("coins") ?? 5000),
            }))
        );
      },
      () => {
        setRounds([]);
        setError("Could not load Lucky User.");
      }
    );
  }, [ready]);

  // pink until the next Lucky User (the server also ends it then)
  const current = rounds?.[0] && now < rounds[0].windowEnd + (maxHours + 3) * 3600_000 ? rounds[0] : null;
  const history = (rounds || []).filter((r) => r !== current).slice(0, 20);
  const liveRoom = luckyRooms.find((r) => live[r]);
  const mine = liveRoom ? live[liveRoom] : null;

  const currentUid = current?.uid;
  useEffect(() => {
    setPhoto("");
    if (!currentUid) return;
    getDoc(doc(db, "users", currentUid))
      .then((s) => setPhoto(String(s.get("photoUrl") || s.get("profilePic") || s.get("avatarUrl") || "").trim()))
      .catch(() => {});
  }, [currentUid]);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title="Lucky User" subtitle={`Random time · ${luckyRooms.join(", ")}`} />

        {/* Current Lucky User */}
        <div className="flex flex-col items-center rounded-3xl border-2 border-[#FF6FB1]/60 bg-gradient-to-br from-[#E8FFF3] via-[#FFEEF7] to-[#FFF6DC] p-5 text-center shadow-[0_8px_24px_rgba(255,111,177,0.25)]">
          <p className="text-xs font-black tracking-[0.15em] text-[#1E9B5A]">🍀 CURRENT LUCKY USER</p>
          {current ? (
            <>
              <div className="relative mt-3">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-[#FF6FB1] bg-white text-3xl font-black text-[#C2185B]">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    current.username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="absolute -right-2 -top-3 text-2xl">👑</span>
              </div>
              <p data-notranslate className="mt-2 text-2xl font-black text-[#E8327E]">
                {current.username}
              </p>
              <p className="text-xs font-semibold text-[#5B6B8C]">💗 Pink ID until the next Lucky User</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-4xl">🎁</p>
              <p className="mt-1 text-lg font-bold text-[#0B2A5B]">{rounds === null ? "Loading…" : "No Lucky User right now"}</p>
              <p className="text-xs text-[#5B6B8C]">The next one could be you!</p>
            </>
          )}
        </div>

        {/* 🍀 My Lucky Chance (only my own level — no numbers, never how points are counted) */}
        <div className="mt-3 rounded-2xl border border-[#FF6FB1]/40 bg-white px-4 py-3.5 shadow-sm">
          <p className="text-sm font-black text-[#0B2A5B]">🍀 My Lucky Chance</p>
          <p className="text-xs text-[#5B6B8C]">Round is on… the winner can be announced any time!</p>
          {!mine ? (
            <p className="mt-2 text-[13px] font-semibold text-[#0B2A5B]">💬 Chat in {luckyRooms.join(" or ")} to take part.</p>
          ) : (
            <>
              {/* ②-B: only a level — no points or numbers (the server sends none) */}
              <div className="mt-1 flex items-center">
                <span className="text-[26px] font-black text-[#E8327E]">
                  {mine.eligible ? `${LEVELS[Math.min(3, Math.max(0, mine.level))]} ${LEVEL_ICON[Math.min(3, Math.max(0, mine.level))]}` : "Next round 🔒"}
                </span>
                {luckyRooms.length > 1 && <span className="ml-auto text-[11px] text-[#5B6B8C]">{liveRoom}</span>}
              </div>
              <div className="mt-2 flex gap-1.5">
                {LEVELS.map((n, i) => (
                  <span key={n} className="h-2.5 flex-1 rounded-full" style={{ background: mine.eligible && i <= mine.level ? LEVEL_FILL[i] : "#F3E3EC" }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[#5B6B8C]">
                {LEVELS.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
              {!mine.eligible && <p className="mt-1 text-xs text-[#0B2A5B]">You can&apos;t win this round — keep chatting for the next one!</p>}
              {mine.firstTimer && mine.eligible && <p className="text-xs text-[#0E9F8E]">✨ First-timer bonus on</p>}
              <p className="text-[10px] text-[#5B6B8C]">Updates every 30 minutes</p>
            </>
          )}
          <p className="mt-2 text-xs text-[#5B6B8C]">💡 Chat more and talk with more people to raise your chance!</p>
          {mine && mine.winsWeek > 0 && <p className="text-xs text-[#5B6B8C]">🏅 Wins this week: {mine.winsWeek}</p>}
        </div>

        {/* Rewards */}
        <div className="mt-3 rounded-2xl border border-[#DCE6F7] bg-gradient-to-r from-[#F1F7FF] to-[#F7F0FF] p-4">
          <p className="text-sm font-black text-[#0B2A5B]">What the Lucky User gets</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["💗", "Pink ID", "Till next"],
              ["⬆️", "+1 Level", "Bonus"],
              ["🪙", `+${luckyCoins.toLocaleString()}`, "Coins"],
            ].map(([i, t, s]) => (
              <div key={t} className="rounded-xl bg-white py-2.5 text-center">
                <p className="text-xl">{i}</p>
                <p className="text-sm font-bold text-[#0B2A5B]">{t}</p>
                <p className="text-[11px] text-[#5B6B8C]">{s}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#5B6B8C]">
            💬 Chat in {luckyRooms.join(" or ")}. At a random time every few hours a lottery picks the Lucky User — the more you really chat with people, the better your chance.
          </p>
        </div>

        <SectionLabel>Previous winners</SectionLabel>
        {error && <p className="px-1 text-sm text-rose-600">{error}</p>}
        {!error && rounds !== null && history.length === 0 && <p className="px-1 text-sm text-[#5B6B8C]">No winners yet.</p>}
        <ul className="space-y-2">
          {history.map((r) => (
            <li key={`${r.uid}-${r.windowEnd}`} className="flex items-center gap-3 rounded-2xl border border-[#E3EAF6] bg-white px-3 py-2.5 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD1E6] to-[#D9F5E6] font-black text-[#C2185B]">
                {r.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span data-notranslate className="block truncate font-bold text-[#0B2A5B]">
                  🍀 {r.username}
                </span>
                <span className="text-[11px] text-[#5B6B8C]">
                  {new Date(r.windowEnd).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
              <span className="text-sm font-black text-[#B7791F]">+{r.coins.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
