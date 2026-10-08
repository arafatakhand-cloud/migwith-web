"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { levelFromXp, totalXpForLevel } from "../../lib/level";
import { badgeForLevel, badgeNameForLevel } from "../../lib/rooms";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { ClassicTitleBar, useIsClassic } from "../_components/Classic";

// 🛡️ Level System, like the app's (tap your level on Home): level, XP bar,
// how XP is earned, unlocked rewards and the last 5 XP events.

const EARN: [string, string][] = [
  ["💬", "Send a normal chat message • +2 XP (15 sec cooldown)"],
  ["🚪", "Enter a room • +5 XP (60 sec cooldown per room entry)"],
  ["👥", "Send a friend request • +10 XP (30 sec cooldown)"],
  ["🎁", "Send a gift • +10 XP (30 sec cooldown)"],
  ["🎮", "Place a successful Luxury Bot bet • +3 XP (15 sec cooldown)"],
];

function unlockedGifts(level: number): string[] {
  const out: string[] = [];
  if (level >= 2) out.push("🎁 Starter Gift");
  if (level >= 4) out.push("⭐ Elite Gift");
  if (level >= 6) out.push("🏆 Gold Gift");
  if (level >= 8) out.push("💎 Diamond Gift");
  if (level >= 10) out.push("👑 Legend Gift");
  return out;
}

const xpLabel = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

type History = { id: string; amount: number; reason: string; ms: number };

export default function LevelPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const classic = useIsClassic();
  const { user, username } = useSession();
  const [xp, setXp] = useState(0);
  const [lastLevelUp, setLastLevelUp] = useState(1);
  const [history, setHistory] = useState<History[]>([]);

  useEffect(() => {
    if (!ready || !user) return;
    const offUser = onSnapshot(doc(db, "users", user.uid), (s) => {
      setXp(Number(s.get("xp") || 0));
      setLastLevelUp(Number(s.get("lastLevelUpLevel") || 1));
    });
    const offHistory = onSnapshot(
      query(collection(db, "users", user.uid, "xp_history"), orderBy("createdAt", "desc"), limit(5)),
      (snap) =>
        setHistory(
          snap.docs.map((d) => ({
            id: d.id,
            amount: Number(d.get("amount") || 0),
            reason: String(d.get("reason") || "Activity"),
            ms: d.get("createdAt")?.toMillis?.() ?? 0,
          }))
        ),
      () => {}
    );
    return () => {
      offUser();
      offHistory();
    };
  }, [ready, user]);

  const level = levelFromXp(xp);
  const start = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  const needed = Math.max(1, next - start);
  const current = Math.max(0, xp - start);
  const gifts = unlockedGifts(level);

  return (
    <PageShell light>
      {/* 📟 Classic: white cards with navy text (.classic-light) */}
      <section className="classic-light mx-auto max-w-2xl space-y-3.5 p-[18px]">
        {ready && (
          <>
            {/* Back button at the TOP, like the app (it used to sit at the bottom). */}
            {classic ? (
              <div className="-mx-[18px] -mt-[18px]">
                <ClassicTitleBar title="🛡️ Level System" onBack={() => router.back()} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <BackButton onClick={() => router.back()} />
                <span className="text-xl font-bold text-[#0B2A5B]">Level System</span>
              </div>
            )}
            <div className="classic-light rounded-3xl border-[1.5px] border-[#5B6F9D] bg-[#2A365A] p-5 text-white">
              <h1 className="text-2xl font-bold">🛡️ Level System</h1>
              <p className="mt-1.5 text-sm text-[#B9C5DF]">{username}</p>
              <div className="mt-3.5 flex items-center gap-1.5">
                <span className="w-7 text-center text-[25px]">{badgeForLevel(level)}</span>
                <div>
                  <p className="text-[25px] font-extrabold leading-none text-[#FFC04A]">Lv.{level}</p>
                  <p className="text-xs font-semibold text-[#B9C5DF]">{badgeNameForLevel(level)}</p>
                </div>
                <div className="ml-3 min-w-0 flex-1">
                  <p className="text-[17px] font-bold">{xp.toLocaleString()} XP</p>
                  <p className="text-xs text-[#B9C5DF]">Next level: {next.toLocaleString()} XP</p>
                </div>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-[10px] bg-[#586079]">
                <div className="h-full rounded-[10px] bg-[#F3A51B]" style={{ width: `${Math.min(100, (current / needed) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-right text-[11px] text-[#B9C5DF]">
                {xpLabel(current)} / {xpLabel(needed)} XP to Lv.{level + 1}
              </p>
            </div>

            {lastLevelUp > 1 && (
              <p className="rounded-[14px] border border-[#E1A229] bg-[#3D2E1A] p-3.5 text-[15px] font-bold text-[#FFC04A]">
                🎉 You reached Level {lastLevelUp}!
              </p>
            )}

            <h2 className="pt-1 text-lg font-bold text-[#0B2A5B]">How you earn XP</h2>
            <div className="space-y-1.5">
              {EARN.map(([icon, label]) => (
                <div key={label} className="classic-light flex items-center gap-3 rounded-[14px] bg-[#2A365A] p-3.5 text-[13px] text-white">
                  <span className="text-[22px]">{icon}</span>
                  {label}
                </div>
              ))}
            </div>

            <h2 className="pt-1 text-lg font-bold text-[#0B2A5B]">Unlocked Rewards</h2>
            {gifts.length === 0 ? (
              <p className="rounded-[14px] bg-[#2A365A] p-3.5 text-[13px] text-[#B9C5DF]">Reach Level 2 to unlock your first gift.</p>
            ) : (
              <div className="space-y-1.5">
                {gifts.map((g) => (
                  <p key={g} className="rounded-[14px] border border-[#5B6F9D] bg-[#2A365A] p-3.5 text-sm font-bold text-[#FFC04A]">
                    ✓ {g}
                  </p>
                ))}
              </div>
            )}

            <h2 className="pt-1 text-lg font-bold text-[#0B2A5B]">Recent XP Activity</h2>
            {history.length === 0 ? (
              <p className="text-[13px] text-[#35507E]">No XP activity yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 rounded-[18px] border border-[#D7DCE6] bg-[#F7F7F7] px-3.5 py-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFE36A] text-[22px]">⭐</span>
                    <div>
                      <p className="text-[17px] font-bold text-[#13203B]">+{h.amount} XP</p>
                      <p className="text-[13px] text-[#8A8F9A]">{h.reason}</p>
                      <p className="text-[11px] font-medium text-[#6D7890]">
                        🕒{" "}
                        {h.ms
                          ? `${new Date(h.ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${new Date(h.ms).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}`
                          : "Time pending"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
