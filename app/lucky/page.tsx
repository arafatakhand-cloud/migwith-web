"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";

// Explore › Lucky User, like the app: lucky_rounds (written only by the
// pickBangladeshLuckyUser function) — the current winner, a countdown to the
// next pick at every 3-hour mark, and the previous winners.

type Round = { uid: string; username: string; windowEnd: number; coins: number };

const SLOT_MS = 3 * 60 * 60 * 1000;

function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

export default function LuckyUserPage() {
  const ready = useRequireLogin();
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [photo, setPhoto] = useState("");

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

  const current = rounds?.[0] && now < rounds[0].windowEnd + SLOT_MS ? rounds[0] : null;
  const history = (rounds || []).filter((r) => r !== current).slice(0, 20);
  const nextPickAt = (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;

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
        <PageTitle title="Lucky User" subtitle="Every 3 hours · Bangladesh room" />

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
              <p className="text-xs font-semibold text-[#5B6B8C]">💗 Pink ID ends in {clock(current.windowEnd + SLOT_MS - now)}</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-4xl">🎁</p>
              <p className="mt-1 text-lg font-bold text-[#0B2A5B]">{rounds === null ? "Loading…" : "No Lucky User right now"}</p>
              <p className="text-xs text-[#5B6B8C]">The next one could be you!</p>
            </>
          )}
        </div>

        {/* Countdown */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#7FB3FF]/40 bg-white px-4 py-3.5 shadow-sm">
          <span className="text-2xl">⏳</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-[#5B6B8C]">Next Lucky User in</p>
            <p className="text-2xl font-black tracking-wide text-[#2F6BEA]">{clock(nextPickAt - now)}</p>
          </div>
          <p className="text-xs text-[#5B6B8C]">
            {new Date(nextPickAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>

        {/* Rewards */}
        <div className="mt-3 rounded-2xl border border-[#DCE6F7] bg-gradient-to-r from-[#F1F7FF] to-[#F7F0FF] p-4">
          <p className="text-sm font-black text-[#0B2A5B]">What the Lucky User gets</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["💗", "Pink ID", "3 hours"],
              ["⬆️", "+1 Level", "Bonus"],
              ["🪙", "+5,000", "Coins"],
            ].map(([i, t, s]) => (
              <div key={t} className="rounded-xl bg-white py-2.5 text-center">
                <p className="text-xl">{i}</p>
                <p className="text-sm font-bold text-[#0B2A5B]">{t}</p>
                <p className="text-[11px] text-[#5B6B8C]">{s}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#5B6B8C]">
            💬 Chat in the Bangladesh room. Every 3 hours the most active chatter becomes the Lucky User automatically.
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
