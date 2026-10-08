"use client";

import { useState } from "react";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { dhakaTime, useLiveSports, type SportRow } from "../../lib/liveSports";

// 📺 Live Scores, like the app's: live cricket & football and today's schedule
// (Bangladesh time). Live matches first, then upcoming, then finished.

function Logo({ src, name }: { src: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad)
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E3ECF7] text-[11px] font-bold text-[#35507E]">
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setBad(true)} className="h-7 w-7 shrink-0 rounded-full bg-white object-contain" />;
}

function StatusChip({ r }: { r: SportRow }) {
  if (r.status === "LIVE")
    return (
      <span className="rounded-full bg-[#E53935] px-2 py-0.5 text-[10px] font-extrabold text-white">
        ● LIVE{r.sport === "football" && r.statusText ? ` ${r.statusText}` : ""}
      </span>
    );
  if (r.status === "UPCOMING") return <span className="rounded-full bg-[#E6F0FB] px-2 py-0.5 text-[10px] font-bold text-[#1E63D6]">{dhakaTime(r.startMs) || "Today"}</span>;
  if (r.status === "FINISHED") return <span className="rounded-full bg-[#EEF1F5] px-2 py-0.5 text-[10px] font-bold text-[#6B7788]">Finished</span>;
  return <span className="rounded-full bg-[#FFF1E0] px-2 py-0.5 text-[10px] font-bold text-[#B7791F]">{r.statusText || "Off"}</span>;
}

function MatchCard({ r }: { r: SportRow }) {
  return (
    <div className={`rounded-2xl bg-white p-3 shadow-sm ${r.status === "LIVE" ? "ring-1 ring-[#E53935]/40" : ""}`}>
      <div className="flex items-center gap-2 text-[11px] text-[#6B7A99]">
        <span className="min-w-0 flex-1 truncate">
          {r.league}
          {r.format ? ` · ${r.format}` : ""}
        </span>
        <StatusChip r={r} />
      </div>
      {[
        [r.home, r.homeLogo, r.homeScore],
        [r.away, r.awayLogo, r.awayScore],
      ].map(([name, logo, score], i) => (
        <div key={i} className="mt-2 flex items-center gap-2">
          <Logo src={logo} name={name} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#0B2A5B]">{name}</span>
          <span className="shrink-0 text-[14px] font-extrabold text-[#0B2A5B]">{score}</span>
        </div>
      ))}
      {r.sport === "cricket" && r.statusText && <p className="mt-2 text-[11.5px] font-semibold text-[#1E7A34]">{r.statusText}</p>}
      {r.venue && <p className="mt-1 truncate text-[10.5px] text-[#8A97A8]">📍 {r.venue}</p>}
    </div>
  );
}

export default function LiveScoresPage() {
  const ready = useRequireLogin();
  const data = useLiveSports(ready);
  const [tab, setTab] = useState<"cricket" | "football">("cricket");
  const list = data ? data[tab] : [];
  const liveCount = (s: "cricket" | "football") => (data ? data[s].filter((r) => r.status === "LIVE").length : 0);
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="Live Scores" subtitle="Live cricket & football · Today" icon="📺" />
        {ready && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["cricket", "🏏 Cricket"],
                  ["football", "⚽ Football"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-xl py-2.5 text-sm font-bold ${tab === id ? "bg-[#2F80ED] text-white shadow" : "bg-white text-[#0B2A5B]"}`}
                >
                  {label}
                  {liveCount(id) > 0 && <span className="ml-1.5 rounded-full bg-[#E53935] px-1.5 text-[10px] text-white">{liveCount(id)} live</span>}
                </button>
              ))}
            </div>
            {!data ? (
              <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading…</p>
            ) : list.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#5B6B8C]">No {tab} matches today.</p>
            ) : (
              <div className="grid gap-2.5 md:grid-cols-2">
                {list.map((r) => (
                  <MatchCard key={r.id || `${r.home}-${r.away}`} r={r} />
                ))}
              </div>
            )}
            {data && data.updatedAtMs > 0 && (
              <p className="mt-3 text-center text-[11px] text-[#8A97A8]">Updated {dhakaTime(data.updatedAtMs)} · refreshes every 10 minutes</p>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
