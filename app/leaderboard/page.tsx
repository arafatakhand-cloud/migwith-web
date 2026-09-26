"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";

// Same boards as the app's Leader Board. Game boards come from the
// getLeaderboard function (ranked by spend, but only win counts are sent);
// gift boards count gift_activity; the level board reads users by level.

type Ranking = { id: string; title: string; icon: string; gameKey?: string; gifts?: "sent" | "received" };

const RANKINGS: Ranking[] = [
  { id: "cricket", title: "Cricket", icon: "🏏", gameKey: "cricket" },
  { id: "teenpatti", title: "Teen Patti", icon: "🃏", gameKey: "teenpatti" },
  { id: "ludo", title: "Ludo", icon: "🎲", gameKey: "ludo" },
  { id: "royale", title: "MIG Royale", icon: "👑", gameKey: "royale" },
  { id: "twentynine", title: "29", icon: "🃏", gameKey: "twentynine" },
  { id: "lowcard", title: "LowCard", icon: "🪙", gameKey: "lowcard" },
  { id: "luxury", title: "Luxury", icon: "💎", gameKey: "luxury" },
  { id: "gift_sent", title: "Gift Sent", icon: "🎁", gifts: "sent" },
  { id: "gift_received", title: "Gift Received", icon: "🎉", gifts: "received" },
  { id: "level", title: "Top Level", icon: "⭐" },
];

const PERIODS = ["Today", "Yesterday", "This Week", "This Month"];

type Row = { name: string; score: string; position: number; photoUrl: string };

const getLeaderboard = httpsCallable<
  { gameKey: string; period: string },
  { players: { uid: string; username: string; wins: number; position: number }[]; mySpend: number }
>(functions, "getLeaderboard");

function photoOf(d: { get: (k: string) => unknown }): string {
  for (const k of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d.get(k) || "").trim();
    if (v) return v;
  }
  return "";
}

// Same start as the app's leaderboardPeriodStart (device midnight based).
function periodStart(period: string): Timestamp {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "Yesterday") d.setDate(d.getDate() - 1);
  else if (period === "This Week") d.setDate(d.getDate() - 7);
  else if (period === "This Month") d.setDate(d.getDate() - 30);
  return Timestamp.fromDate(d);
}

async function photoByUsername(name: string): Promise<string> {
  const snap = await getDocs(query(collection(db, "users"), where("username", "==", name), limit(1)));
  return snap.docs[0] ? photoOf(snap.docs[0]) : "";
}

async function load(r: Ranking, period: string): Promise<{ rows: Row[]; mySpend: number | null }> {
  if (r.gameKey) {
    const { data } = await getLeaderboard({ gameKey: r.gameKey, period });
    const players = data?.players || [];
    const top = players[0];
    let topPhoto = "";
    if (top?.username) topPhoto = await photoByUsername(top.username).catch(() => "");
    return {
      rows: players.map((p, i) => ({
        name: String(p.username || "Player"),
        score: p.wins === 1 ? "1 win" : `${p.wins || 0} wins`,
        position: p.position || i + 1,
        photoUrl: i === 0 ? topPhoto : "",
      })),
      mySpend: Number(data?.mySpend || 0),
    };
  }

  if (r.gifts) {
    const snap = await getDocs(query(collection(db, "gift_activity"), where("createdAt", ">=", periodStart(period))));
    const counts = new Map<string, number>();
    snap.docs.forEach((d) => {
      const name = String(d.get(r.gifts === "received" ? "toUsername" : "fromUsername") || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    const topPhoto = top[0] ? await photoByUsername(top[0][0]).catch(() => "") : "";
    return {
      rows: top.map(([name, n], i) => ({
        name,
        score: n === 1 ? "1 gift" : `${n} gifts`,
        position: i + 1,
        photoUrl: i === 0 ? topPhoto : "",
      })),
      mySpend: null,
    };
  }

  // Top Level: not time based.
  const snap = await getDocs(query(collection(db, "users"), orderBy("level", "desc"), limit(20)));
  return {
    rows: snap.docs.map((d, i) => ({
      name: String(d.get("username") || "Player"),
      score: `Lv ${Number(d.get("level") || 1)}`,
      position: i + 1,
      photoUrl: i === 0 ? photoOf(d) : "",
    })),
    mySpend: null,
  };
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [ranking, setRanking] = useState<Ranking>(RANKINGS[0]);
  const [period, setPeriod] = useState("Today");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mySpend, setMySpend] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setRows(null);
    setError("");
    load(ranking, period)
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setMySpend(res.mySpend);
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setRows([]);
        setError("Could not load this leaderboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [user, ranking, period, refresh]);

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  const top = rows?.[0];
  const timed = ranking.id !== "level";

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tight">🏆 Leader Board</h1>
          <button
            type="button"
            onClick={() => setRefresh((n) => n + 1)}
            title="Refresh"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-lg hover:bg-white/10"
          >
            ↻
          </button>
        </div>

        {/* Boards */}
        <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {RANKINGS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRanking(r)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
                ranking.id === r.id
                  ? "border-amber-300 bg-amber-300 text-neutral-900"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {r.icon} {r.title}
            </button>
          ))}
        </div>

        {/* Period */}
        {timed && (
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-xl py-2 text-xs font-bold transition ${
                  period === p ? "bg-blue-600 text-white" : "text-white/55 hover:bg-white/5"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* #1 */}
        {top && (
          <Link
            href={`/profile/${encodeURIComponent(top.name)}`}
            className="mt-5 flex flex-col items-center rounded-3xl border border-amber-300/30 bg-gradient-to-b from-amber-400/20 to-transparent px-4 py-6 text-center"
          >
            <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-amber-300 bg-gradient-to-br from-blue-500 to-cyan-400">
              {top.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={top.photoUrl} alt={top.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-black">
                  {top.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs font-bold tracking-widest text-amber-200/80">🥇 #1 {ranking.title.toUpperCase()}</p>
            <p className="text-xl font-black">{top.name}</p>
            <p className="text-sm font-bold text-amber-300">{top.score}</p>
          </Link>
        )}

        {/* List */}
        <ul className="mt-3 space-y-1.5">
          {rows === null && <li className="py-10 text-center text-sm text-white/35">Loading…</li>}
          {rows?.length === 0 && (
            <li className="py-10 text-center text-sm text-white/35">
              {error || `No ${ranking.title} players ${timed ? period.toLowerCase() : ""} yet.`}
            </li>
          )}
          {rows?.slice(1).map((r) => (
            <li key={r.position}>
              <Link
                href={`/profile/${encodeURIComponent(r.name)}`}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
              >
                <span className="w-8 text-center text-lg font-black text-white/60">
                  {MEDALS[r.position - 1] || r.position}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-sm font-black">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                <span className="shrink-0 text-sm font-bold text-amber-300">{r.score}</span>
              </Link>
            </li>
          ))}
        </ul>

        {ranking.gameKey && mySpend !== null && (
          <p className="mt-4 text-center text-xs text-white/45">
            Ranked by coins played. Your {ranking.title} play {period.toLowerCase()}:{" "}
            <span className="font-bold text-amber-300">🪙 {mySpend.toLocaleString()}</span> (only you can see this)
          </p>
        )}
      </section>
    </PageShell>
  );
}
