"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { RefreshButton } from "../_components/RefreshButton";

// 🎮 Ludo Contest, like the Gift Contest page. The count is kept by Cloud
// Functions: every Ludo win while miglife's contest is running adds one win.
// miglife (the admin) sees Start / Stop / Reset here.

type Player = { uid: string; username: string; position: number; wins: number };
type State = {
  active: boolean;
  contestId: string;
  players: Player[];
  myWins: number;
  myPosition: number;
  isOwner: boolean;
};

const getLudoContest = httpsCallable<Record<string, never>, State>(functions, "getLudoContest");
const ceoLudoContest = httpsCallable<{ action: "start" | "stop" | "reset" }, { ok: boolean }>(functions, "ceoLudoContest");

const BG = "radial-gradient(120% 60% at 50% 0%, #A0287A 0%, #4A1150 55%, #1E0A2E 100%)";
const MEDAL = ["#FFD34D", "#CFD6E4", "#E7A26B"];

export default function LudoContestPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setError("");
    getLudoContest({})
      .then((r) => setState(r.data))
      .catch(() => setError("Couldn't load the Ludo Contest. Please try again."));
  }, [ready, tick]);

  const act = async (action: "start" | "stop" | "reset") => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await ceoLudoContest({ action });
      setTick((t) => t + 1);
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const live = !!state?.active;
  const players = state?.players || [];

  return (
    <PageShell light>
      <div className="min-h-[calc(100dvh-57px)] text-white" style={{ background: BG }}>
        <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/explore"))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black">🎮 Ludo Contest</h1>
              <p className="text-[10.5px] font-extrabold tracking-[0.15em] text-[#FFB3DE]">LIVE CONTEST · TOP PLAYERS</p>
            </div>
            <RefreshButton
              onClick={() => setTick((t) => t + 1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white"
            />
          </div>

          {state?.isOwner && (
            <div className="mb-3 flex flex-wrap gap-2">
              {!live ? (
                <button type="button" disabled={busy} onClick={() => act("start")} className="rounded-full bg-[#FFD34D] px-4 py-2 text-[13px] font-black text-[#3A1A2B] disabled:opacity-50">
                  ▶ Start contest
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => act("stop")} className="rounded-full bg-white/15 px-4 py-2 text-[13px] font-black disabled:opacity-50">
                  ■ Stop contest
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => act("reset")} className="rounded-full bg-[#FF8FC7]/30 px-4 py-2 text-[13px] font-black text-[#FFD0E8] disabled:opacity-50">
                🔄 Reset
              </button>
            </div>
          )}

          {error && <p className="mb-3 rounded-xl bg-red-500/20 px-3 py-2 text-[13px]">{error}</p>}

          {!state && !error ? (
            <p className="py-16 text-center text-sm text-white/70">Loading…</p>
          ) : !live ? (
            <div className="rounded-[20px] border border-dashed border-white/25 bg-white/[.07] px-4 py-6 text-center">
              <p className="text-[40px] leading-none">🎮💤</p>
              <p className="mt-2 text-[15px] font-extrabold">No contest right now</p>
              <p className="mt-1 text-[12.5px] text-white/75">
                The next Ludo Contest is coming soon. Watch Alerts and Announcements — the top players win prizes! 🏆
              </p>
            </div>
          ) : (
            <>
              {state?.myPosition ? (
                <p className="mb-3 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-bold">
                  You are #{state.myPosition} with {state.myWins} win{state.myWins === 1 ? "" : "s"}
                </p>
              ) : null}
              {players.length === 0 ? (
                <p className="rounded-[20px] border border-dashed border-white/25 bg-white/[.07] px-4 py-6 text-center text-[13px] text-white/75">
                  No Ludo wins yet. Play Ludo to take the first place! 🎲
                </p>
              ) : (
                <ol className="grid gap-2">
                  {players.map((p) => (
                    <li key={p.uid} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[18px] border border-white/15 bg-white/10 px-3 py-2.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-black text-[#3A1A2B]"
                        style={{ background: MEDAL[p.position - 1] || "rgba(255,255,255,.2)", color: p.position <= 3 ? "#3A1A2B" : "#fff" }}
                      >
                        {p.position}
                      </span>
                      <span className="min-w-0 truncate font-extrabold">{p.username}</span>
                      <span className="font-black tabular-nums text-[#FFD34D]">{p.wins} 🏆</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
