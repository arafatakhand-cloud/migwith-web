"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { claimMission, loadMissions, type MissionDay } from "../../lib/missions";

// 🎯 Daily Missions: 5 missions a day (new at 12 AM Bangladesh). Finish one →
// Claim → Season Points (SP). All of them → a bonus. The server counts.

const TINTS: Record<string, string> = { chat: "#EAF2FF", gift: "#FFEFF5", game: "#EAFBF1", room: "#FFF6E0", react: "#F1EAFF" };
const left = (ms: number) => {
  const m = Math.max(0, Math.floor((ms - Date.now()) / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function MissionsPage() {
  useRequireLogin();
  const { user } = useSession();
  const router = useRouter();
  const [d, setD] = useState<MissionDay | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [, tick] = useState(0);
  const load = () =>
    loadMissions()
      .then((x) => (setD(x), setErr("")))
      .catch((e: any) => setErr(e?.message || "Could not load the missions."));
  useEffect(() => {
    if (user) load();
  }, [user]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  // a new day while the page is open → fresh missions
  useEffect(() => {
    if (d && Date.now() > d.resetAt) load();
  });

  const claim = async (key: string) => {
    setBusy(key);
    try {
      const g = await claimMission(key);
      setToast(`🎉 +${g} SP`);
      setTimeout(() => setToast(""), 2500);
      await load();
    } catch (e: any) {
      setToast(e?.message || "Could not claim.");
      setTimeout(() => setToast(""), 3000);
    }
    setBusy("");
  };

  if (!user) return null;
  const done = d ? d.missions.filter((m) => m.progress >= m.target).length : 0;
  const all = d?.missions.length || 0;
  const allClaimed = !!d && all > 0 && d.missions.every((m) => m.claimed);
  return (
    <PageShell light>
      <section className="mx-auto max-w-xl p-3.5 pb-10 text-[#14284B]">
        <div className="flex items-center gap-1.5">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold text-[#0B1F3A]">🎯 Daily Missions</h1>
            <p className="text-xs text-[#68758D]">Finish missions, earn Season Points</p>
          </div>
        </div>

        {/* hero */}
        <div
          className="relative mt-3 overflow-hidden rounded-[22px] p-4 text-white"
          style={{ background: "linear-gradient(135deg,#1E3A8A,#2563EB 55%,#7C3AED)", boxShadow: "0 5px 0 #17307A,0 14px 22px rgba(37,99,235,.3)" }}
        >
          <span className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <div className="relative flex items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-extrabold tracking-[.8px] text-white/85">🎯 TODAY&apos;S MISSIONS</p>
              <p className="mt-0.5 text-[24px] font-black">
                {done} / {all || 5} done
              </p>
              <p className="text-[12px] text-white/85">{d ? `New missions in ${left(d.resetAt)}` : " "}</p>
            </div>
            <div className="text-center">
              <p className="text-[22px] font-black">+{d?.spToday ?? 0}</p>
              <p className="text-[10px] font-bold text-white/85">SP today</p>
            </div>
          </div>
          <div className="relative mt-2.5 h-[9px] overflow-hidden rounded-full bg-white/20">
            <span className="block h-full rounded-full bg-gradient-to-r from-[#FFE29A] to-[#F5B83D]" style={{ width: `${all ? (done / all) * 100 : 0}%` }} />
          </div>
        </div>

        {err && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-[#DC2626]">{err}</p>}
        {!d && !err && <p className="p-4 text-sm text-[#5B6B8C]">Loading…</p>}

        <ul className="mt-3 space-y-2.5">
          {d?.missions.map((m) => {
            const finished = m.progress >= m.target;
            return (
              <li key={m.key} className="flex items-center gap-3 rounded-[18px] bg-white px-3 py-2.5 shadow-[0_3px_0_#D3DFF1,0_7px_12px_rgba(30,60,120,.1)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[21px]" style={{ background: TINTS[m.key] || "#F1F5FB" }}>
                  {m.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-extrabold">{m.title}</p>
                  <p className="text-[11px] text-[#5B6B8C]">
                    {m.progress} / {m.target} {m.unit}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3ECF7]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#16A34A]" style={{ width: `${(m.progress / m.target) * 100}%` }} />
                  </div>
                </div>
                {m.claimed ? (
                  <span className="shrink-0 text-[11.5px] font-black text-[#15803D]">✓ +{m.sp}</span>
                ) : finished ? (
                  <button
                    type="button"
                    disabled={busy === m.key}
                    onClick={() => claim(m.key)}
                    className="shrink-0 rounded-full bg-gradient-to-b from-[#22C55E] to-[#15803D] px-3 py-1.5 text-[11.5px] font-black text-white shadow-[0_2px_0_#126B33] active:translate-y-[1px] disabled:opacity-60"
                  >
                    {busy === m.key ? "…" : `Claim +${m.sp}`}
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full bg-[#F1EAFF] px-2.5 py-1 text-[11.5px] font-black text-[#7C3AED]">+{m.sp} SP</span>
                )}
              </li>
            );
          })}
          {d && d.missions.length > 0 && (
            <li className="flex items-center gap-3 rounded-[18px] bg-gradient-to-br from-[#FFF7E0] to-[#FFE7A6] px-3 py-2.5 shadow-[0_3px_0_#E7C569,0_8px_14px_rgba(180,120,0,.15)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-white text-[21px]">🎉</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-extrabold text-[#6A4A00]">All {all} done — bonus</p>
                <p className="text-[11px] text-[#92600A]">claim every mission today</p>
              </div>
              {d.bonusClaimed ? (
                <span className="shrink-0 text-[11.5px] font-black text-[#15803D]">✓ +{d.bonusSp}</span>
              ) : allClaimed ? (
                <button
                  type="button"
                  disabled={busy === "bonus"}
                  onClick={() => claim("bonus")}
                  className="shrink-0 rounded-full bg-gradient-to-b from-[#FFE29A] to-[#E9A92E] px-3 py-1.5 text-[11.5px] font-black text-[#2A1A00] shadow-[0_2px_0_#B97F12]"
                >
                  {busy === "bonus" ? "…" : `Claim +${d.bonusSp}`}
                </button>
              ) : (
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-black text-[#92600A]">+{d.bonusSp} SP</span>
              )}
            </li>
          )}
        </ul>

        {d && (
          <p className="mt-4 text-center text-[12px] font-bold text-[#5B6B8C]">
            ⭐ Your Season Points: <b className="text-[#7C3AED]">{d.spTotal.toLocaleString()} SP</b> · the Season Pass is coming soon
          </p>
        )}
        {toast && (
          <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0B1F3A]/95 px-4 py-2 text-[13px] font-bold text-white">{toast}</p>
        )}
      </section>
    </PageShell>
  );
}
