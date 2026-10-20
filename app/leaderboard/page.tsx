"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { PastelCard, SectionLabel } from "../_components/LightCards";
import { BackButton } from "../_components/BackButton";
import { ClassicTitleBar, useIsClassic } from "../_components/Classic";
import { RefreshButton } from "../_components/RefreshButton";

// Same boards as the app's Leader Board. Game boards come from the
// getLeaderboard function (ranked by spend, but only win counts are sent);
// gift boards count gift_activity; the level board reads users by level.

type Ranking = { id: string; title: string; icon: string; color: string; gameKey?: string; gifts?: "sent" | "received" };

const RANKINGS: Ranking[] = [
  { id: "cricket", title: "Cricket", icon: "🏏", gameKey: "cricket", color: "#1E8C4E" },
  { id: "teenpatti", title: "Teen Patti", icon: "🃏", gameKey: "teenpatti", color: "#E12A6B" },
  { id: "ludo", title: "Ludo", icon: "🎲", gameKey: "ludo", color: "#3984D9" },
  { id: "royale", title: "MIG Royale", icon: "👑", gameKey: "royale", color: "#7B3FC7" },
  { id: "twentynine", title: "29", icon: "🃏", gameKey: "twentynine", color: "#12AFC7" },
  { id: "lowcard", title: "LowCard", icon: "🪙", gameKey: "lowcard", color: "#D9A400" },
  { id: "luxury", title: "Luxury", icon: "💎", gameKey: "luxury", color: "#E12A6B" },
  { id: "gift_sent", title: "Gift Sent", icon: "🎁", gifts: "sent", color: "#E5484D" },
  { id: "gift_received", title: "Gift Received", icon: "🎉", gifts: "received", color: "#D9730D" },
  { id: "level", title: "Top Level", icon: "⭐", color: "#D9A400" },
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
    // "Yesterday" ends at today's midnight; the other periods run up to now.
    const range = [where("createdAt", ">=", periodStart(period))];
    if (period === "Yesterday") range.push(where("createdAt", "<", periodStart("Today")));
    const snap = await getDocs(query(collection(db, "gift_activity"), ...range));
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
  const classic = useIsClassic();
  const { user, loading } = useCurrentUser();
  const [ranking, setRanking] = useState<Ranking>(RANKINGS[0]);
  // The board list first, like the app; a board opens when picked.
  const [picked, setPicked] = useState(false);
  const [period, setPeriod] = useState("Today");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mySpend, setMySpend] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !picked) return;
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
  }, [user, picked, ranking, period, refresh]);

  if (loading || !user) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  const top = rows?.[0];
  const timed = ranking.id !== "level";

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-8 pt-4 sm:px-6">
        {classic ? (
          <div className="-mx-3 -mt-4 sm:-mx-6">
            <ClassicTitleBar
              title={picked ? `${ranking.icon} ${ranking.title}` : "🏆 Rankings"}
              subtitle={picked ? (timed ? `${period} ranking` : "All time") : "Top players"}
              onBack={() => (picked ? setPicked(false) : router.back())}
            >
              <RefreshButton onClick={() => setRefresh((n) => n + 1)} className="rounded px-2 text-xl font-bold text-white" />
            </ClassicTitleBar>
          </div>
        ) : (
        <div className="flex items-center gap-3">
          <BackButton onClick={() => (picked ? setPicked(false) : router.back())} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black">{picked ? `${ranking.icon} ${ranking.title}` : "Rankings"}</h1>
            {picked && <p className="text-xs text-[#6B7A99]">{timed ? `${period} ranking` : "All time"}</p>}
          </div>
          <RefreshButton
            onClick={() => setRefresh((n) => n + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white text-lg text-[#2F80ED] shadow-sm"
          />
        </div>
        )}

        {!picked ? (
          <>
            <SectionLabel>Top players</SectionLabel>
            <div className="grid gap-2.5 md:grid-cols-2">
              {RANKINGS.map((r) => (
                <PastelCard
                  key={r.id}
                  icon={r.icon}
                  title={r.title}
                  subtitle={r.id === "level" ? "All time" : "Today"}
                  color={r.color}
                  onClick={() => {
                    setRanking(r);
                    setPeriod("Today");
                    setPicked(true);
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <>


        {/* Period */}
        {timed && (
          <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl border border-[#D5E3F5] bg-white p-1 shadow-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-xl py-2 text-xs font-bold transition ${
                  period === p ? "bg-[#2F80ED] text-white" : "text-[#5B6B8C] hover:bg-[#F4F9FF]"
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
            className="mt-5 flex flex-col items-center rounded-3xl border border-[#F5D77A] bg-gradient-to-b from-[#FFF3D6] to-white px-4 py-6 shadow-sm text-center"
          >
            <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-amber-300 bg-[#DCEBFB] text-[#174EA6]">
              {top.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={top.photoUrl} alt={top.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-black">
                  {top.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs font-bold tracking-widest text-[#B7791F]">🥇 #1 {ranking.title.toUpperCase()}</p>
            <p data-notranslate className="text-xl font-black text-[#0B2A5B]">{top.name}</p>
            <p className="text-sm font-bold text-[#B7791F]">{top.score}</p>
          </Link>
        )}

        {/* List */}
        <ul className="mt-3 space-y-1.5">
          {rows === null && <li className="py-10 text-center text-sm text-[#6B7A99]">Loading…</li>}
          {rows?.length === 0 && (
            <li className="py-10 text-center text-sm text-[#6B7A99]">
              {error || `No ${ranking.title} players ${timed ? period.toLowerCase() : ""} yet.`}
            </li>
          )}
          {rows?.slice(1).map((r) => (
            <li key={r.position}>
              <Link
                href={`/profile/${encodeURIComponent(r.name)}`}
                className="flex items-center gap-3 rounded-2xl border border-[#E3ECF7] bg-white px-4 py-2.5 shadow-sm transition hover:bg-[#F4F9FF]"
              >
                <span className="w-8 text-center text-lg font-black text-[#5B6B8C]">
                  {MEDALS[r.position - 1] || r.position}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCEBFB] text-sm font-black text-[#174EA6]">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
                <span data-notranslate className="min-w-0 flex-1 truncate font-bold text-[#0B2A5B]">{r.name}</span>
                <span className="shrink-0 text-sm font-bold text-[#B7791F]">{r.score}</span>
              </Link>
            </li>
          ))}
        </ul>

        {ranking.gameKey && mySpend !== null && (
          <p className="mt-4 text-center text-xs text-[#5B6B8C]">
            Ranked by coins played. Your {ranking.title} play {period.toLowerCase()}:{" "}
            <span className="font-bold text-[#B7791F]">🪙 {mySpend.toLocaleString()}</span> (only you can see this)
          </p>
        )}
          </>
        )}
      </section>
    </PageShell>
  );
}
