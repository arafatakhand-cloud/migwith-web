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
@keyframes mcShine{from{transform:translateX(-120%) skewX(-20deg)}to{transform:translateX(420%) skewX(-20deg)}}
`;

const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));

/** Counts up from 0 when the number arrives. */
function CountUp({ to, fmt }: { to: number; fmt: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
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
  }, [to]);
  return <>{fmt(v)}</>;
}

export function MentorIdCard({ me, uid }: { me: string; uid: string }) {
  const [photo, setPhoto] = useState("");
  const [since, setSince] = useState("");
  const [merchants, setMerchants] = useState(0);
  const [tagged, setTagged] = useState(0);
  const [bonus, setBonus] = useState(0);

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
    return onSnapshot(
      doc(db, "mentor_earnings", me),
      (s) => setBonus(Number(s.get("totalEarnings") ?? s.get("total") ?? 0) || 0),
      () => {}
    );
  }, [me, uid]);

  const stats: [string, number, (n: number) => string][] = [
    ["Merchants", merchants, (n) => String(Math.round(n))],
    ["Tagged", tagged, (n) => String(Math.round(n))],
    ["Bonus", bonus, short],
  ];

  return (
    <div className="rounded-[26px] bg-white p-1 shadow-xl" style={{ animation: "mcFlip .8s cubic-bezier(.2,.8,.2,1) both" }}>
      <style>{CSS}</style>
      <div className="relative overflow-hidden rounded-[22px] border border-[#D5E3F5] bg-gradient-to-br from-[#EAF1FC] to-white p-4 text-[#0B2A5B]">
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/70"
          style={{ animation: "mcShine 2.6s ease-in-out .9s infinite" }}
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-[0.25em] text-[#1E63D6]">miGlife · MENTOR CARD</p>
          <span className="text-xl">💼</span>
        </div>
        <div className="mt-4 flex items-center gap-3 text-left">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#1E63D6] bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] text-2xl font-black text-white"
            style={{ animation: "mcPop .7s cubic-bezier(.2,.8,.2,1) .4s both" }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              me.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0" style={{ animation: "mcUp .6s cubic-bezier(.2,.8,.2,1) .5s both" }}>
            <p data-notranslate className="truncate text-xl font-black">@{me}</p>
            {since && <p className="text-xs text-[#5B6B8C]">Mentor since {since}</p>}
            <p className="mt-1 inline-block rounded-full bg-[#1E63D6]/10 px-2 py-0.5 text-[10px] font-bold text-[#1E63D6]">★ Verified Mentor</p>
          </div>
        </div>
        <div className="mt-4 flex justify-between border-t border-[#D5E3F5] pt-3 text-center text-[11px]">
          {stats.map(([label, n, fmt]) => (
            <div key={label} className="flex-1">
              <p className="text-base font-black text-[#1E63D6]">
                <CountUp to={n} fmt={fmt} />
              </p>
              <p className="text-[#5B6B8C]">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 text-center" style={{ animation: "mcUp .6s cubic-bezier(.2,.8,.2,1) .8s both" }}>
        <p className="text-sm text-[#5B6B8C]">Approve requests and manage your merchants.</p>
        <Link
          href="/mentor"
          className="mt-3 block rounded-2xl bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] py-3 text-base font-black text-white shadow transition active:scale-[.97]"
        >
          Open Mentor Dashboard
        </Link>
      </div>
    </div>
  );
}
