"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { RefreshButton } from "../_components/RefreshButton";

// 🎮 Ludo Contests. miglife can set up several contests, each with its own name.
// A contest counts Ludo wins only while it is running. Players see the running ones.

type Player = { uid: string; username: string; position: number; wins: number };
type Contest = {
  id: string;
  name: string;
  active: boolean;
  startedAtMs: number;
  players: Player[];
  myWins: number;
  myPosition: number;
};
type State = { contests: Contest[]; isOwner: boolean };

const getLudoContests = httpsCallable<Record<string, never>, State>(functions, "getLudoContest");
const ceoLudoContest = httpsCallable<{ action: "create" | "start" | "stop" | "reset" | "delete"; id?: string; name?: string }, { ok: boolean }>(
  functions,
  "ceoLudoContest"
);

const BG = "radial-gradient(120% 60% at 50% 0%, #A0287A 0%, #4A1150 55%, #1E0A2E 100%)";
const MEDAL = ["#FFD34D", "#CFD6E4", "#E7A26B"];

export default function LudoContestPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!ready) return;
    setError("");
    getLudoContests({})
      .then((r) => setState(r.data))
      .catch(() => setError("Couldn't load the Ludo Contests. Please try again."));
  }, [ready, tick]);

  const act = async (payload: { action: "create" | "start" | "stop" | "reset" | "delete"; id?: string; name?: string }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await ceoLudoContest(payload);
      if (payload.action === "create") setNewName("");
      setTick((t) => t + 1);
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const contests = state?.contests || [];
  const running = contests.filter((c) => c.active);
  const isOwner = !!state?.isOwner;

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
              <p className="text-[10.5px] font-extrabold tracking-[0.15em] text-[#FFB3DE]">LIVE CONTESTS · TOP PLAYERS</p>
            </div>
            <RefreshButton
              onClick={() => setTick((t) => t + 1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white"
            />
          </div>

          {isOwner && (
            <div className="mb-4 rounded-[20px] border border-white/20 bg-white/[.08] p-3">
              <p className="mb-2 text-[12px] font-black tracking-wide text-[#FFD34D]">👑 ADMIN · NEW CONTEST</p>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={60}
                  placeholder="Contest name, e.g. Weekend Ludo"
                  className="min-w-0 flex-1 rounded-xl bg-white/15 px-3 py-2 text-[14px] text-white placeholder:text-white/60 outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !newName.trim()}
                  onClick={() => act({ action: "create", name: newName.trim() })}
                  className="rounded-xl bg-[#FFD34D] px-4 py-2 text-[13px] font-black text-[#3A1A2B] disabled:opacity-40"
                >
                  + Add
                </button>
              </div>

              {contests.length > 0 && (
                <ul className="mt-3 grid gap-2">
                  {contests.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-extrabold">
                        {c.name} <span className="text-[11px] text-white/70">{c.active ? "· running" : "· stopped"}</span>
                      </span>
                      {c.active ? (
                        <button type="button" disabled={busy} onClick={() => act({ action: "stop", id: c.id })} className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-black disabled:opacity-50">
                          ■ Stop
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => act({ action: "start", id: c.id })} className="rounded-full bg-[#FFD34D] px-3 py-1 text-[12px] font-black text-[#3A1A2B] disabled:opacity-50">
                          ▶ Start
                        </button>
                      )}
                      <button type="button" disabled={busy} onClick={() => act({ action: "reset", id: c.id })} className="rounded-full bg-[#FF8FC7]/30 px-3 py-1 text-[12px] font-black text-[#FFD0E8] disabled:opacity-50">
                        🔄 Reset
                      </button>
                      <button type="button" disabled={busy} onClick={() => act({ action: "delete", id: c.id })} className="rounded-full bg-red-500/25 px-3 py-1 text-[12px] font-black disabled:opacity-50">
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="mb-3 rounded-xl bg-red-500/20 px-3 py-2 text-[13px]">{error}</p>}

          {!state && !error ? (
            <p className="py-16 text-center text-sm text-white/70">Loading…</p>
          ) : running.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-white/25 bg-white/[.07] px-4 py-6 text-center">
              <p className="text-[40px] leading-none">🎮💤</p>
              <p className="mt-2 text-[15px] font-extrabold">No contest right now</p>
              <p className="mt-1 text-[12.5px] text-white/75">
                The next Ludo Contest is coming soon. Watch Alerts and Announcements — the top players win prizes! 🏆
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {running.map((c) => (
                <div key={c.id} className="rounded-[22px] border border-white/15 bg-white/[.06] p-3">
                  <h2 className="mb-2 px-1 text-[16px] font-black">{c.name}</h2>
                  {c.myPosition ? (
                    <p className="mb-2 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-bold">
                      You are #{c.myPosition} with {c.myWins} win{c.myWins === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  {c.players.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[13px] text-white/75">No Ludo wins yet. Play Ludo to take the first place! 🎲</p>
                  ) : (
                    <ol className="grid gap-2">
                      {c.players.map((p) => (
                        <li key={p.uid} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[18px] border border-white/15 bg-white/10 px-3 py-2.5">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-black"
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
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
