"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

// 💼 miGlife Partner for a mentor: a "Mentor Card" (like an ID card) with
// the real numbers — merchants, tagged users and the total mentor bonus —
// and the door to the Mentor Dashboard. Light, in the chosen colour theme,
// like the dashboard.

const CSS = `
@keyframes mcFlip{from{opacity:0;transform:perspective(800px) rotateY(-70deg)}to{opacity:1;transform:none}}
@keyframes mcUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes mcPop{0%{opacity:0;transform:scale(.4)}70%{transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}
@keyframes mcShine{from{transform:translateX(-120%) skewX(-20deg)}to{transform:translateX(620%) skewX(-20deg)}}
.mc-glass{background:linear-gradient(180deg,transparent 72%,rgba(40,80,160,.08)),linear-gradient(180deg,rgba(255,255,255,.95),rgba(240,246,255,.88));border:1.5px solid #fff;box-shadow:inset 0 2px 1px #fff,inset 0 -3px 6px rgba(40,80,140,.1),0 10px 24px rgba(40,80,140,.16)}
.mc-blue{background:linear-gradient(180deg,rgba(255,255,255,.35),transparent 45%),linear-gradient(180deg,#5aa2ff,#1565d8);border:1.5px solid rgba(255,255,255,.85);box-shadow:inset 0 -3px 4px rgba(0,0,0,.12),0 8px 18px rgba(21,101,216,.4);color:#fff}

`;

const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));

// The card plays its entrance (flip, pop, count-up) only the first time it is
// opened; coming back to this tab (a swipe, the top bar) shows it at once,
// with the numbers it had, so nothing flickers or counts up again.
let played = false;
const kept = new Map<string, { photo: string; since: string; merchants: number; tagged: number; bonus: number; requests: number }>();

/** Counts up from 0 when the number arrives (from where it was, after that). */
function CountUp({ to, fmt, animate }: { to: number; fmt: (n: number) => string; animate: boolean }) {
  const [v, setV] = useState(animate ? 0 : to);
  useEffect(() => {
    if (!animate) return setV(to);
    if (!to) return setV(0);
    const t0 = performance.now();
    let f = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1100);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) f = requestAnimationFrame(tick);
    };
    f = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(f);
  }, [to, animate]);
  return <>{fmt(v)}</>;
}

export function MentorIdCard({ me, uid }: { me: string; uid: string }) {
  const last = kept.get(me);
  const [animate] = useState(() => !played);
  const [photo, setPhoto] = useState(last?.photo || "");
  const [since, setSince] = useState(last?.since || "");
  const [merchants, setMerchants] = useState(last?.merchants || 0);
  const [tagged, setTagged] = useState(last?.tagged || 0);
  const [bonus, setBonus] = useState(last?.bonus || 0);
  const [requests, setRequests] = useState(last?.requests || 0);

  useEffect(() => {
    played = true;
  }, []);
  useEffect(() => {
    kept.set(me, { photo, since, merchants, tagged, bonus, requests });
  }, [me, photo, since, merchants, tagged, bonus, requests]);
  const anim = (a: string) => (animate ? { animation: a } : undefined);

  useEffect(() => {
    getDoc(doc(db, "users", uid))
      .then((s) => {
        setPhoto(String(s.get("photoUrl") || ""));
        const at = s.get("mentorSince") as { toDate?: () => Date } | undefined;
        if (at?.toDate) setSince(at.toDate().toLocaleDateString("en-US", { month: "short", year: "numeric" }));
      })
      .catch(() => {});
    getDocs(query(collection(db, "mentor_merchants"), where("mentorUsername", "==", me)))
      .then((s) => setMerchants(s.size))
      .catch(() => {});
    getDocs(query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me), where("status", "==", "active")))
      .then((s) => setTagged(s.size))
      .catch(() => {});
    const offReq = onSnapshot(
      query(collection(db, "mentor_requests"), where("toMentor", "==", me), where("status", "==", "pending")),
      (s) => setRequests(s.size),
      () => {}
    );
    const offBonus = onSnapshot(
      doc(db, "mentor_earnings", me),
      (s) => setBonus(Number(s.get("totalEarnings") ?? s.get("total") ?? 0) || 0),
      () => {}
    );
    return () => {
      offReq();
      offBonus();
    };
  }, [me, uid]);

  const stats: [string, number, (n: number) => string][] = [
    ["Merchants", merchants, (n) => String(Math.round(n))],
    ["Tagged", tagged, (n) => String(Math.round(n))],
    ["Bonus", bonus, short],
  ];
  const quick: [string, string, string, number][] = [
    ["📥", "Requests", "requests", requests],
    ["🏪", "Merchants", "merchants", 0],
    ["🏷️", "Tagged", "tagged", 0],
    ["💰", "Bonus", "bonus", 0],
  ];

  return (
    <div className="text-[#0B2A5B]">
      <style>{CSS}</style>
      {/* 💳 the Mentor Card — a blue bank-card with a soft shine */}
      <div
        className="relative overflow-hidden rounded-[24px] border-[1.5px] border-white/70 bg-[linear-gradient(135deg,#1565D8,#3B7BF0_45%,#7B5CF0)] px-[18px] pb-5 pt-4 text-white shadow-[0_16px_30px_rgba(59,91,240,.38),inset_0_1.5px_1px_rgba(255,255,255,.55)]"
        style={anim("mcFlip .8s cubic-bezier(.2,.8,.2,1) both")}
      >
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,.22)_45%,transparent_60%)]" />
        <span className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/[.12]" />
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-1/6 bg-white/25 blur-md"
          style={{ animation: "mcShine 3.6s ease-in-out .9s infinite" }}
        />
        <div className="relative flex items-center justify-between">
          <p className="text-[12px] font-bold tracking-[0.22em]">miGlife · MENTOR CARD</p>
          <span className="text-[22px]">💼</span>
        </div>
        <div className="relative mt-4 flex items-center gap-3 text-left">
          <span
            className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/90 bg-white/20 text-2xl font-black text-white"
            style={anim("mcPop .7s cubic-bezier(.2,.8,.2,1) .4s both")}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              me.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1" style={anim("mcUp .6s cubic-bezier(.2,.8,.2,1) .5s both")}>
            <p data-notranslate className="truncate text-[21px] font-black">@{me}</p>
            {since && <p className="text-xs text-white/85">Mentor since {since}</p>}
            <p className="mt-1 inline-block rounded-full bg-white/[.22] px-2 py-0.5 text-[10.5px] font-extrabold">★ Verified Mentor</p>
          </div>
          {/* the card chip */}
          <span className="h-7 w-[38px] shrink-0 rounded-md bg-gradient-to-br from-[#FFE9A8] to-[#E6B422] shadow-[inset_0_0_0_1px_rgba(0,0,0,.15)]" />
        </div>
        <div className="relative mt-[18px] flex justify-between">
          {stats.map(([label, n, fmt], i) => (
            <div key={label} className={i === 2 ? "text-right" : ""}>
              <p className="text-[10px] uppercase tracking-wide text-white/75">{label}</p>
              <p className="text-lg font-black">
                {i === 2 && "🪙 "}
                <CountUp to={n} fmt={fmt} animate={animate} />
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* quick doors into the Mentor Dashboard */}
      <div className="mt-4 grid grid-cols-4 gap-2" style={anim("mcUp .6s cubic-bezier(.2,.8,.2,1) .7s both")}>
        {quick.map(([icon, label, tab, badge]) => (
          <Link
            key={tab}
            href={`/mentor?tab=${tab}`}
            className="mc-glass relative rounded-2xl py-2.5 text-center transition active:scale-95"
          >
            {badge > 0 && (
              <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-[#EF4444] px-1 text-[10px] font-black leading-[18px] text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            <span className="block text-xl">{icon}</span>
            <span className="block text-[11.5px] font-bold text-[#5B6B8C]">{label}</span>
          </Link>
        ))}
      </div>

      <div className="text-center" style={anim("mcUp .6s cubic-bezier(.2,.8,.2,1) .85s both")}>
        <p className="mb-2.5 mt-4 text-[13px] text-[#35507E]">Approve requests and manage your merchants.</p>
        <Link
          href="/mentor"
          className="mc-blue flex h-[52px] items-center justify-center rounded-[26px] text-base font-black transition active:scale-[.97]"
        >
          Open Mentor Dashboard →
        </Link>
      </div>
    </div>
  );
}
