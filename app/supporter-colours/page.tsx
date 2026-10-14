"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";
import { SupporterBadge } from "../_components/SupporterBadge";
import {
  SUPPORTER_DAYS,
  SUPPORTER_LEAGUES,
  SUPPORTER_PRICE,
  SUPPORTER_TEAMS,
  activeSupporterTeam,
  type SupporterTeam,
} from "../../lib/supporterTeams";

// Discover › ⚽ Supporter Colours (like the app's SupporterColoursPage): pick a
// football team — your name shows in its colour with a small team badge in
// rooms, 30 days for 50,000 coins. Coins only move on the server
// (buySupporterColour). Fan colours only, no club logos.

const buyCall = httpsCallable<{ team: string; operationId: string }, { until?: number }>(functions, "buySupporterColour");

const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const opId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

export default function SupporterColoursPage() {
  useRequireLogin();
  const { user } = useSession();
  const { username } = useCurrentUser();
  const uid = user?.uid;
  const [balance, setBalance] = useState<number | null>(null);
  const [mine, setMine] = useState<{ team: string; until: number }>({ team: "", until: 0 });
  const [league, setLeague] = useState("all");
  const [confirm, setConfirm] = useState<SupporterTeam | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      setBalance(Number(snap.get("balance") || 0));
      setMine({ team: String(snap.get("supporterTeam") || ""), until: Number(snap.get("supporterUntil") || 0) });
    });
  }, [uid]);

  const current = activeSupporterTeam(mine.team, mine.until);
  const daysLeft = current ? Math.ceil((mine.until - Date.now()) / 86_400_000) : 0;
  const canAfford = balance !== null && balance >= SUPPORTER_PRICE;

  const buy = async (t: SupporterTeam) => {
    setConfirm(null);
    setBusy(true);
    setMessage("");
    try {
      const { data } = await buyCall({ team: t.id, operationId: opId() });
      setMessage(`⚽ You now support ${t.name}${data?.until ? ` — until ${fmtDate(data.until)}` : ""}.`);
    } catch (e: any) {
      setMessage(e?.message || "Could not buy Supporter Colours.");
    } finally {
      setBusy(false);
    }
  };

  const leagues = league === "all" ? SUPPORTER_LEAGUES : SUPPORTER_LEAGUES.filter((l) => l.id === league);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6 lg:max-w-4xl">
        <PageTitle title="Supporter Colours" subtitle="Your football team's colour & badge" icon="⚽" />
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="font-semibold text-[#35507E]">
            🪙 {SUPPORTER_PRICE.toLocaleString()} coins · {SUPPORTER_DAYS} days
          </span>
          <span className="rounded-full bg-[#0B2A5B] px-3 py-1 text-xs font-bold text-[#6FE0A0]">🪙 {balance === null ? "…" : short(balance)}</span>
        </div>
        {message && <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{message}</p>}

        {/* my team */}
        <div
          className="mt-3 rounded-2xl p-[1.5px]"
          style={{ background: current ? `linear-gradient(135deg, ${current.c1}, ${current.c2})` : "#D5E3F5" }}
        >
          <div className="rounded-[15px] bg-white p-3.5">
            <p className="text-[11px] font-bold tracking-widest text-[#8A97B0]">MY TEAM</p>
            {current ? (
              <>
                <div className="mt-1.5 flex items-center gap-2">
                  <SupporterBadge team={current} size={13} />
                  <span className="text-lg font-black" style={{ color: current.text }}>
                    {current.name}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#5B6B8C]">
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left · until {fmtDate(mine.until)}
                </p>
                <div className="mt-2 rounded-xl bg-[#F4F7FB] px-3 py-2 text-sm">
                  <span className="font-bold" style={{ color: current.text }}>
                    {username || "you"}
                  </span>{" "}
                  <SupporterBadge team={current} size={9} />
                  <span className="font-bold" style={{ color: current.text }}>
                    :
                  </span>{" "}
                  <span className="text-[#222]">Come on! ⚽🔥</span>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-[#5B6B8C]">No team yet — pick one below.</p>
            )}
          </div>
        </div>

        {/* league chips */}
        <div className="-mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: "all", name: "All", flag: "⚽" }, ...SUPPORTER_LEAGUES].map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLeague(l.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${
                league === l.id ? "bg-[#0B2A5B] text-white" : "border border-[#D5E3F5] bg-white text-[#35507E]"
              }`}
            >
              {l.flag} {l.name}
            </button>
          ))}
        </div>

        {leagues.map((l) => (
          <div key={l.id}>
            <SectionLabel>
              {l.flag} {l.name}
            </SectionLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUPPORTER_TEAMS.filter((t) => t.league === l.id).map((t) => {
                const isMine = current?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm(t)}
                    className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
                    style={{ borderLeft: `5px solid ${t.c1}` }}
                  >
                    <SupporterBadge team={t} size={12} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-extrabold" style={{ color: t.text }}>
                        {t.name}
                      </span>
                      <span className="text-[11px] text-[#8A97B0]">{isMine ? "✅ Your team · tap to add 30 days" : "Name colour + badge"}</span>
                    </span>
                    <span className="shrink-0 rounded-full border border-[#F5D77A] bg-[#FFF8E1] px-2 py-0.5 text-[11px] font-bold text-[#8A5A00]">
                      🪙 {short(SUPPORTER_PRICE)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <p className="mt-6 px-1 text-center text-[11px] leading-5 text-[#8A97B0]">
          Fan colours only. miGlife is not connected with any football club or league; team names belong to their owners.
          A Style Studio / VIP colour shows first while it is on — your badge still shows.
        </p>
      </section>

      {confirm && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-6" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-[#14213D] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <SupporterBadge team={confirm} size={14} />
              <p className="text-lg font-extrabold" style={{ color: confirm.text }}>
                {confirm.name}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#3D4A60]">
              {current && current.id === confirm.id
                ? `Add ${SUPPORTER_DAYS} more days`
                : current
                  ? `Switch from ${current.name} — your days left move to ${confirm.name}, plus ${SUPPORTER_DAYS} days`
                  : `Your name in ${confirm.name} colour with the ${confirm.short} badge for ${SUPPORTER_DAYS} days`}{" "}
              for <b>{SUPPORTER_PRICE.toLocaleString()} coins</b>.
            </p>
            {!canAfford && <p className="mt-2 text-sm font-semibold text-[#D9534F]">Not enough coins.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-full border border-[#D5E3F5] px-5 py-2 text-sm font-bold text-[#5B6B8C]">
                Cancel
              </button>
              <button
                type="button"
                disabled={!canAfford || busy}
                onClick={() => buy(confirm)}
                className="rounded-full bg-[#2F6ABD] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
