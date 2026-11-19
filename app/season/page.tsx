"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { buyGold, claimSeason, loadSeason, rewardIcon, rewardLabel, type Reward, type SeasonData } from "../../lib/season";

// 🎟 Season Pass: 30 days, 30 levels. Season Points from Daily Missions fill the
// bar; each level has a FREE and a GOLD reward. Gold: once per season, coins.

export default function SeasonPage() {
  useRequireLogin();
  const { user } = useSession();
  const router = useRouter();
  const [d, setD] = useState<SeasonData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [confirmGold, setConfirmGold] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const load = () => loadSeason().then((x) => (setD(x), setErr(""))).catch((e: any) => setErr(e?.message || "Could not load the season."));
  useEffect(() => {
    if (user) load();
  }, [user]);
  // scroll the track to my level once
  const scrolled = useRef(false);
  useEffect(() => {
    if (!d || scrolled.current || !track.current) return;
    scrolled.current = true;
    const col = track.current.querySelector<HTMLElement>(`[data-lv="${Math.max(1, d.me.level)}"]`);
    if (col) track.current.scrollLeft = Math.max(0, col.offsetLeft - 70);
  }, [d]);
  const say = (t: string) => (setToast(t), setTimeout(() => setToast(""), 2600));
  const claim = async (lane: "free" | "gold", level: number) => {
    setBusy(`${lane}${level}`);
    try {
      const r = await claimSeason(lane, level);
      say(`🎉 ${rewardIcon(r)} ${rewardLabel(r)}`);
      await load();
    } catch (e: any) {
      say(e?.message || "Could not claim.");
    }
    setBusy("");
  };
  const unlock = async () => {
    setBusy("gold");
    try {
      await buyGold();
      say("👑 Gold Pass unlocked!");
      setConfirmGold(false);
      await load();
    } catch (e: any) {
      say(e?.message || "Could not unlock.");
    }
    setBusy("");
  };

  if (!user) return null;
  const s = d?.season;
  const me = d?.me;
  const per = s?.spPerLevel || 250;
  const into = me ? (me.level >= 30 ? per : me.sp - me.level * per) : 0;
  const daysLeft = s ? Math.max(0, Math.ceil((s.endMs - Date.now()) / 86_400_000)) : 0;
  const box = (lane: "free" | "gold", n: number, r: Reward) => {
    const key = `${lane === "gold" ? "g" : "f"}${n}`;
    const got = !!me?.claimed[key];
    const reached = !!me && me.level >= n;
    const can = reached && !got && (lane === "free" || me!.gold);
    const locked = !reached || (lane === "gold" && !me?.gold);
    return (
      <button
        type="button"
        key={key}
        disabled={!can || busy === `${lane}${n}`}
        onClick={() => claim(lane, n)}
        className={`relative flex h-[68px] w-full flex-col items-center justify-center rounded-[14px] text-[22px] ${
          lane === "gold" ? "bg-gradient-to-b from-[#FFF7E0] to-[#FFE7A6] shadow-[0_2px_0_#E7C569]" : "bg-gradient-to-b from-[#F7FAFF] to-[#EEF3FB] shadow-[inset_0_1px_0_#fff,0_2px_0_#D3DFF1]"
        } ${can ? "outline outline-[2.5px] outline-offset-1 outline-[#22C55E]" : ""} ${locked && !got ? "opacity-55" : ""}`}
      >
        {rewardIcon(r)}
        <span className="mt-0.5 max-w-full truncate px-1 text-[8.5px] font-extrabold text-[#5B6B8C]">{rewardLabel(r)}</span>
        {got && <span className="absolute right-1 top-1 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#16A34A] text-[9px] font-black text-white">✓</span>}
        {locked && !got && <span className="absolute right-1 top-0.5 text-[10px]">🔒</span>}
      </button>
    );
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-xl p-3.5 pb-10 text-[#14284B]">
        <div className="flex items-center gap-1.5">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold text-[#0B1F3A]">🎟 Season Pass</h1>
            <p className="text-xs text-[#68758D]">Level up with Daily Missions, claim rewards</p>
          </div>
          <Link href="/missions" className="rounded-full bg-white/85 px-3 py-1.5 text-[12px] font-extrabold text-[#2563EB] shadow">
            🎯 Missions
          </Link>
        </div>
        {err && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-[#DC2626]">{err}</p>}
        {!d && !err && <p className="p-4 text-sm text-[#5B6B8C]">Loading…</p>}
        {s && !s.id && <p className="mt-4 rounded-2xl bg-white p-4 text-center text-sm text-[#5B6B8C]">The first season starts soon. Keep doing your Daily Missions!</p>}

        {s && s.id && me && (
          <>
            {/* hero */}
            <div
              className="relative mt-3 overflow-hidden rounded-[22px] p-4 text-white"
              style={{ background: "linear-gradient(135deg,#7C2D12,#EA580C 50%,#DB2777)", boxShadow: "0 5px 0 #6B1F0A,0 14px 22px rgba(234,88,12,.3)" }}
            >
              <span className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
              <div className="relative flex items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-extrabold tracking-[.8px] text-white/90">🎟 {s.name.toUpperCase()}</p>
                  <p className="mt-0.5 text-[24px] font-black">Level {me.level} / 30</p>
                  <p className="text-[12px] text-white/90">
                    {me.level >= 30 ? "Max level!" : `${into} / ${per} SP to level ${me.level + 1}`} · {s.active ? `${daysLeft} days left` : "season ended"}
                  </p>
                </div>
                <span className="text-[42px]">{me.gold ? "👑" : "🏆"}</span>
              </div>
              <div className="relative mt-2.5 h-[9px] overflow-hidden rounded-full bg-white/25">
                <span className="block h-full rounded-full bg-gradient-to-r from-[#FFE29A] to-[#F5B83D]" style={{ width: `${(into / per) * 100}%` }} />
              </div>
            </div>

            {/* the track */}
            <div className="mt-3 rounded-[20px] bg-white p-3 shadow-[0_3px_0_#D3DFF1,0_7px_12px_rgba(30,60,120,.1)]">
              <div className="flex">
                <div className="flex w-[52px] shrink-0 flex-col gap-1.5 pt-[26px] text-center text-[10px] font-black">
                  <span className="flex h-[68px] items-center justify-center text-[#5B6B8C]">FREE</span>
                  <span className="flex h-[68px] items-center justify-center text-[#B45309]">👑 GOLD</span>
                </div>
                <div ref={track} className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
                  {s.levels.map((l, i) => {
                    const n = i + 1;
                    return (
                      <div key={n} data-lv={n} className="flex w-[70px] shrink-0 flex-col gap-1.5">
                        <span
                          className={`mx-auto rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                            n === Math.max(1, me.level) ? "bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white shadow-[0_2px_0_#173E9E]" : n <= me.level ? "text-[#15803D]" : "text-[#8A97A8]"
                          }`}
                        >
                          {n}
                        </span>
                        {box("free", n, l.free)}
                        {box("gold", n, l.gold)}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1.5 text-center text-[10.5px] font-bold text-[#5B6B8C]">← swipe to see all 30 levels → · tap a green box to claim</p>
            </div>

            {/* badges */}
            {me.badges.length > 0 && (
              <div className="mt-3 rounded-[18px] bg-white p-3 shadow-[0_3px_0_#D3DFF1]">
                <p className="text-[12.5px] font-extrabold">🏅 My season badges</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {me.badges.map((b) => (
                    <span key={b} className="rounded-full bg-[#F1F5FB] px-2.5 py-1 text-[12px] font-bold">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* gold */}
            {!me.gold && s.active && (
              <div className="mt-3 rounded-[18px] bg-gradient-to-br from-[#FFF7E0] to-[#FFE19A] p-3.5 shadow-[0_3px_0_#E7C569]">
                <div className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black text-[#6A4A00]">👑 Unlock the Gold path</p>
                    <p className="text-[11px] font-bold text-[#92600A]">all gold rewards up to your level, at once</p>
                  </div>
                  <p className="text-[16px] font-black text-[#6A4A00]">🪙 {s.goldPrice.toLocaleString()}</p>
                </div>
                {confirmGold ? (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setConfirmGold(false)} className="flex-1 rounded-xl bg-white/80 py-2.5 text-[13px] font-black text-[#6A4A00]">
                      Cancel
                    </button>
                    <button type="button" disabled={busy === "gold"} onClick={unlock} className="flex-[1.4] rounded-xl bg-gradient-to-b from-[#FFE29A] to-[#E9A92E] py-2.5 text-[13px] font-black text-[#2A1A00] shadow-[0_3px_0_#B97F12] disabled:opacity-60">
                      {busy === "gold" ? "…" : `Pay 🪙 ${s.goldPrice.toLocaleString()}`}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmGold(true)} className="mt-2 w-full rounded-xl bg-gradient-to-b from-[#FFE29A] to-[#E9A92E] py-2.5 text-[14px] font-black text-[#2A1A00] shadow-[0_3px_0_#B97F12]">
                    Unlock Gold Pass
                  </button>
                )}
              </div>
            )}
            <p className="mt-3 text-center text-[11.5px] font-bold text-[#5B6B8C]">⭐ {me.sp.toLocaleString()} Season Points this season</p>
          </>
        )}
        {toast && <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0B1F3A]/95 px-4 py-2 text-[13px] font-bold text-white">{toast}</p>}
      </section>
    </PageShell>
  );
}
