"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { ClassicSectionBar, ClassicTitleBar } from "../_components/Classic";
import { LsLiveBadge } from "../_components/LiveSportsWidgets";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useIsClassic } from "../../lib/uiStyle";
import { lsAgo, lsTime, useLiveSports, type SportRow } from "../../lib/liveSports";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { isMainFounderName } from "../../lib/founder";

// 📺 Live Scores, like the app's LiveScores.kt: 🔴 Live / 🗓️ Today tabs (opens
// on Today when nothing is live), All / Cricket / Football chips, league
// headers on Today, and "Updated x min ago". The page only READS
// live_sports/today; the refreshLiveSports Cloud Function writes it.

const ORDER: Record<SportRow["status"], number> = { LIVE: 0, UPCOMING: 1, FINISHED: 2, OFF: 3 };

function StatusPill({ m, classic }: { m: SportRow; classic: boolean }) {
  const shape = classic ? "rounded-[3px]" : "rounded-full";
  if (m.status === "LIVE")
    return (
      <span className={`inline-flex shrink-0 items-center bg-[#E53935] px-2 py-[3px] text-[10px] font-extrabold text-white ${shape}`}>
        <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        {m.sport === "football" && m.statusText ? `LIVE ${m.statusText}` : "LIVE"}
      </span>
    );
  if (m.status === "FINISHED") return <span className={`shrink-0 bg-[#6A7896] px-2 py-[3px] text-[10px] font-extrabold text-white ${shape}`}>FT</span>;
  if (m.status === "OFF") return <span className={`shrink-0 bg-[#9E9E9E] px-2 py-[3px] text-[10px] font-bold text-white ${shape}`}>{m.statusText || "Off"}</span>;
  return (
    <span className={`shrink-0 px-2 py-[3px] text-[11px] font-bold ${shape} ${classic ? "bg-[#E6EEF8] text-[#2F6ABD]" : "bg-[#EAF1FF] text-[#3B7BF0]"}`}>
      🕒 {lsTime(m.startMs)}
    </span>
  );
}

function TeamLine({ name, short, logo, score, sport, live, classic }: { name: string; short: string; logo: string; score: string; sport: string; live: boolean; classic: boolean }) {
  const [bad, setBad] = useState(false);
  const letter = ((short || name).match(/[A-Za-z0-9]/)?.[0] || "?").toUpperCase();
  return (
    <div className="flex items-center">
      <span className={`relative flex h-[26px] w-[26px] shrink-0 items-center justify-center bg-[#F0F3F8] text-xs font-bold text-[#6A7896] ${classic ? "rounded-[3px]" : "rounded-full"}`}>
        {letter}
        {logo && !bad && !/\.svg$/i.test(logo) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" onError={() => setBad(true)} className="absolute h-[22px] w-[22px] bg-[#F0F3F8] object-contain" />
        )}
      </span>
      <span className="ml-[9px] min-w-0 flex-1 truncate text-sm font-semibold text-[#16264A]">{name || "TBD"}</span>
      {score && (
        <span
          className={`ml-2 shrink-0 font-extrabold ${sport === "football" ? "text-lg" : "text-[13px]"} ${
            live ? (classic ? "text-[#1B7F3A]" : "text-[#1E9E55]") : "text-[#16264A]"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function MatchCard({ m, classic }: { m: SportRow; classic: boolean }) {
  const live = m.status === "LIVE";
  const note =
    m.sport === "cricket" && m.statusText && m.status !== "UPCOMING" ? m.statusText : m.venue ? `📍 ${m.venue}` : "";
  return (
    <div
      className={
        classic
          ? "border-b border-[#DDE3EA] bg-white px-2.5 py-[9px]"
          : `mx-3 my-[5px] rounded-2xl border bg-white p-3 ${live ? "border-[#E53935]/45" : "border-[#E2E8F3]"}`
      }
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-[#6A7896]">
          {[m.sport === "cricket" ? "🏏" : "⚽", m.format, m.league].filter(Boolean).join(" · ")}
        </span>
        <StatusPill m={m} classic={classic} />
      </div>
      <div className="mt-2 space-y-1.5">
        <TeamLine name={m.home} short={m.homeShort} logo={m.homeLogo} score={m.homeScore} sport={m.sport} live={live} classic={classic} />
        <TeamLine name={m.away} short={m.awayShort} logo={m.awayLogo} score={m.awayScore} sport={m.sport} live={live} classic={classic} />
      </div>
      {note && (
        <p className={`mt-[7px] line-clamp-2 text-xs ${live ? `font-semibold ${classic ? "text-[#C62828]" : "text-[#E53935]"}` : "text-[#51607D]"}`}>{note}</p>
      )}
    </div>
  );
}

// 🗓 Today's date (Bangladesh time) as a little calendar page.
function TodayTile() {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "Asia/Dhaka" });
  const day = now.toLocaleString("en-US", { day: "numeric", timeZone: "Asia/Dhaka" });
  return (
    <span className="mx-auto block w-16 overflow-hidden rounded-lg border border-[#C9D2DE] bg-white text-center">
      <span className="block bg-[#E53935] py-0.5 text-[11px] font-bold text-white">{month}</span>
      <span className="block py-0.5 text-[28px] font-extrabold text-[#16264A]">{day}</span>
    </span>
  );
}

function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="px-6 pt-14 text-center">
      {icon === "DATE" ? <TodayTile /> : <p className="text-[44px]">{icon}</p>}
      <p className="mt-2.5 text-base font-bold text-[#16264A]">{title}</p>
      {sub && <p className="mt-1 text-[13px] text-[#6A7896]">{sub}</p>}
    </div>
  );
}

export default function LiveScoresPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const classic = useIsClassic();
  const data = useLiveSports(ready);
  const [tab, setTab] = useState<0 | 1>(0); // 0 = Live, 1 = Today
  const [sport, setSport] = useState<"all" | "cricket" | "football">("all");
  const [now, setNow] = useState(() => Date.now());
  const autoTabDone = useRef(false);
  // 🔧 miglife: why nothing is listed + "Refresh now" (founderRefreshLiveSports)
  const { username } = useCurrentUser();
  const isFounder = isMainFounderName(username);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const refreshNow = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const { data: r } = await httpsCallable<Record<string, never>, { cricket?: number; football?: number }>(functions, "founderRefreshLiveSports")({});
      setRefreshMsg(`✓ Refreshed: ${r?.cricket ?? 0} cricket · ${r?.football ?? 0} football`);
    } catch (e: any) {
      setRefreshMsg(e?.message || "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  };

  const cricket = data?.cricket ?? [];
  const football = data?.football ?? [];
  const liveCount = [...cricket, ...football].filter((r) => r.status === "LIVE").length;

  // First load: nothing live → open straight on 🗓️ Today.
  useEffect(() => {
    if (!data || autoTabDone.current) return;
    autoTabDone.current = true;
    setTab(liveCount > 0 ? 0 : 1);
  }, [data, liveCount]);
  // Only refreshes "Updated x min ago" — once a minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const all = sport === "cricket" ? cricket : sport === "football" ? football : [...cricket, ...football];
  const shown =
    tab === 0 ? all.filter((r) => r.status === "LIVE") : [...all].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.startMs - b.startMs);
  const ago = lsAgo(data?.updatedAtMs ?? 0, now);

  // League headers on the Today tab.
  const items: ({ header: string } | { m: SportRow })[] = [];
  let last = "";
  for (const m of shown) {
    const key = `${m.sport === "cricket" ? "🏏 " : "⚽ "}${m.league || m.sport.charAt(0).toUpperCase() + m.sport.slice(1)}`;
    if (tab === 1 && key !== last) {
      items.push({ header: key });
      last = key;
    }
    items.push({ m });
  }

  const tabBtn = (label: string, selected: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-bold ${classic ? "rounded-[3px]" : "rounded-[11px]"} ${
        selected
          ? classic
            ? "bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] text-white"
            : "bg-gradient-to-r from-[#3B7BF0] to-[#7B4DE0] text-white"
          : classic
            ? "text-[#16315F]"
            : "text-[#51607D]"
      }`}
    >
      {label}
    </button>
  );
  const chip = (label: string, selected: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 border px-3.5 py-[7px] text-[13px] font-semibold ${classic ? "rounded-[3px]" : "rounded-full"} ${
        selected
          ? `border-transparent text-white ${classic ? "bg-[#2F6ABD]" : "bg-[#16264A]"}`
          : `bg-white text-[#35445F] ${classic ? "border-[#B9C6D6]" : "border-[#DCE4F2]"}`
      }`}
    >
      {label}
    </button>
  );

  return (
    <PageShell light>
      <section className={`mx-auto max-w-2xl pb-8 ${classic ? "bg-[#EEF1F5]" : ""}`}>
        {classic ? (
          <ClassicTitleBar title="📺 Live Scores" subtitle={ago || "Cricket & Football"} onBack={() => router.back()} />
        ) : (
          <div className="flex items-center px-3 py-3 text-white sm:rounded-b-2xl" style={{ background: "linear-gradient(90deg, #0F1B3D, #233A7A, #5B2A86)" }}>
            <button type="button" onClick={() => router.back()} aria-label="Back" className="px-1.5 text-2xl leading-none">
              ‹
            </button>
            <div className="ml-1 min-w-0 flex-1">
              <p className="text-[21px] font-extrabold">📺 Live Scores</p>
              <p className="text-[11px] text-white/75">{ago || "Cricket & Football • Bangladesh time"}</p>
            </div>
            {liveCount > 0 && <LsLiveBadge count={liveCount} />}
          </div>
        )}

        {ready && (
          <>
            <div className={classic ? "flex bg-[#DDE3EA]" : "mx-3 my-2.5 flex rounded-[14px] border border-[#DCE4F2] bg-white p-1"}>
              {tabBtn(`🔴 Live${liveCount > 0 ? ` (${liveCount})` : ""}`, tab === 0, () => setTab(0))}
              {tabBtn("🗓️ Today", tab === 1, () => setTab(1))}
            </div>
            <div className={`no-scrollbar flex gap-2 overflow-x-auto px-3 ${classic ? "py-2" : "pb-2"}`}>
              {chip("All", sport === "all", () => setSport("all"))}
              {chip(`🏏 Cricket (${cricket.length})`, sport === "cricket", () => setSport("cricket"))}
              {chip(`⚽ Football (${football.length})`, sport === "football", () => setSport("football"))}
            </div>

            {isFounder && data && (
              <div className="mx-3 mb-2 rounded-xl border border-[#F5D77A] bg-[#FFF8E1] p-3 text-xs text-[#5B4300]">
                <p className="font-extrabold">🔧 Server status (only miglife sees this)</p>
                <p className="mt-1">
                  {data.exists ? `Last update: ${ago || "—"}` : "The server has not written any scores yet (refreshLiveSports has never run)."}
                </p>
                {data.problems.cricket && <p className="mt-1 text-[#B3261E]">🏏 {data.problems.cricket}</p>}
                {data.problems.football && <p className="mt-1 text-[#B3261E]">⚽ {data.problems.football}</p>}
                {data.exists && !data.problems.cricket && !data.problems.football && <p className="mt-1 text-[#1E7A34]">✓ No problems reported.</p>}
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={refreshNow}
                  className="mt-2 rounded-lg bg-[#F07A00] px-3 py-1.5 font-bold text-white disabled:opacity-60"
                >
                  {refreshing ? "Refreshing…" : "🔄 Refresh now"}
                </button>
                {refreshMsg && <p className="mt-1.5 font-bold">{refreshMsg}</p>}
              </div>
            )}
            {!data ? (
              <Empty icon="⏳" title="Loading scores…" />
            ) : shown.length === 0 && tab === 0 ? (
              <Empty icon="😴" title="No live match right now" sub="Open the 🗓️ Today tab to see today's schedule." />
            ) : shown.length === 0 ? (
              <Empty icon="DATE" title="No matches today" sub="The schedule refreshes every few minutes." />
            ) : (
              <div className="pb-6">
                {items.map((it, i) =>
                  "header" in it ? (
                    classic ? (
                      <ClassicSectionBar key={`h${i}`}>{it.header}</ClassicSectionBar>
                    ) : (
                      <p key={`h${i}`} className="truncate px-4 pb-1 pt-3 text-xs font-extrabold text-[#3B7BF0]">
                        {it.header}
                      </p>
                    )
                  ) : (
                    <MatchCard key={`${it.m.sport}-${it.m.id || i}`} m={it.m} classic={classic} />
                  )
                )}
              </div>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
