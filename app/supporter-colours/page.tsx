"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "../../lib/firebase";
import { useSupporterImages } from "../../lib/supporterImages";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";
import { SupporterBadge, SupporterJersey } from "../_components/SupporterBadge";
import { isMainFounderName } from "../../lib/founder";
import {
  SUPPORTER_DAYS,
  SUPPORTER_LEAGUES,
  SUPPORTER_PRICE,
  SUPPORTER_TEAMS,
  activeSupporterTeam,
  parseSupporterTerms,
  supporterBackground,
  supporterPriceOf,
  type SupporterTeam,
  type SupporterTerms,
} from "../../lib/supporterTeams";

// Discover › ⚽ Supporter Colours (like the app's SupporterColoursPage): pick a
// football team — your name shows in its colour with a small team badge in
// rooms, for the price and days miglife sets (✏️ — built-in 50,000 coins / 30
// days; ✏️ on a team gives it its own price). Coins only move on the server
// (buySupporterColour). Fan colours only.

const buyCall = httpsCallable<{ team: string; operationId: string }, { until?: number }>(functions, "buySupporterColour");
const setPriceCall = httpsCallable<{ price?: number; days?: number; team?: string; reset?: boolean; image?: string }, { ok?: boolean }>(
  functions,
  "founderSetSupporterPrice"
);

// 300,000 → "300K", 1,500,000 → "1.5M"
const compact = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n);
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
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<SupporterTeam | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // the price and days miglife set (✏️), live
  const [terms, setTerms] = useState<SupporterTerms>({ price: SUPPORTER_PRICE, days: SUPPORTER_DAYS, prices: {} });
  const isFounder = isMainFounderName(username);
  const [editing, setEditing] = useState(false);
  // ✏️ on a team: that team's own price (null = the default for every team)
  const [editTeam, setEditTeam] = useState<SupporterTeam | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDays, setEditDays] = useState("");
  // 📷 a team's picture (miglife): shown instead of the crest everywhere
  const pictures = useSupporterImages();
  const [picBusy, setPicBusy] = useState(false);

  const savePicture = async (team: SupporterTeam, file: File | null) => {
    setPicBusy(true);
    try {
      let url = "";
      if (file) {
        if (!file.type.startsWith("image/")) throw new Error("Pick a picture (JPG / PNG).");
        if (file.size >= 5 * 1024 * 1024) throw new Error("The picture must be under 5 MB.");
        const r = storageRef(storage, `supporter_badges/${team.id}.jpg`);
        await uploadBytes(r, file, { contentType: file.type });
        url = await getDownloadURL(r);
      }
      await setPriceCall({ team: team.id, image: url });
      setMessage(file ? `📷 ${team.name}: picture saved` : `✅ ${team.name}: back to the crest`);
      setEditing(false);
    } catch (e: any) {
      setMessage(e?.message || "Could not save the picture.");
    } finally {
      setPicBusy(false);
    }
  };

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "app_settings", "shop_overrides"),
      (snap) => setTerms(parseSupporterTerms(snap.get("supporter"))),
      () => {}
    );
  }, [uid]);

  const savePrice = async (reset = false) => {
    const price = Number(editPrice.replace(/[, ]/g, ""));
    const days = Number(editDays);
    const team = editTeam;
    setEditing(false);
    try {
      if (team) {
        await setPriceCall(reset ? { team: team.id, reset: true } : { team: team.id, price });
        setMessage(reset ? `✅ ${team.name}: back to the default price` : `✅ ${team.name}: ${price.toLocaleString()} coins`);
      } else {
        await setPriceCall({ price, days });
        setMessage(`✅ Default price set: ${price.toLocaleString()} coins · ${days} days`);
      }
    } catch (e: any) {
      setMessage(e?.message || "Could not set the price.");
    }
  };
  const openEdit = (team: SupporterTeam | null) => {
    setEditTeam(team);
    setEditPrice(String(team ? supporterPriceOf(terms, team.id) : terms.price));
    setEditDays(String(terms.days));
    setEditing(true);
  };

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      setBalance(Number(snap.get("balance") || 0));
      setMine({ team: String(snap.get("supporterTeam") || ""), until: Number(snap.get("supporterUntil") || 0) });
    });
  }, [uid]);

  const current = activeSupporterTeam(mine.team, mine.until);
  const daysLeft = current ? Math.ceil((mine.until - Date.now()) / 86_400_000) : 0;

  const buy = async (t: SupporterTeam) => {
    setConfirm(null);
    setBusy(true);
    setMessage("");
    try {
      const { data } = await buyCall({ team: t.id, operationId: opId() });
      setMessage(`⚽ You now support ${t.name}${data?.until ? ` — until ${fmtDate(data.until)}` : ""}.`);
    } catch (e: any) {
      setMessage(e?.message || "Could not buy the Supporters Badge.");
    } finally {
      setBusy(false);
    }
  };

  const leagues = league === "all" ? SUPPORTER_LEAGUES : SUPPORTER_LEAGUES.filter((l) => l.id === league);
  // 🔍 find a team by name or letters
  const needle = search.trim().toLowerCase();
  const teamsOf = (leagueId: string) =>
    SUPPORTER_TEAMS.filter(
      (t) => t.league === leagueId && (!needle || t.name.toLowerCase().includes(needle) || t.mark.toLowerCase().includes(needle) || t.short.toLowerCase().includes(needle))
    );
  const shownLeagues = leagues.filter((l) => teamsOf(l.id).length > 0);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6 lg:max-w-4xl">
        <PageTitle title="Supporters Badge" subtitle="Your football team's badge" icon="⚽" />
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-[#35507E]">
            🪙 {Object.keys(terms.prices).length ? "From " : ""}
            {Math.min(...SUPPORTER_TEAMS.map((t) => supporterPriceOf(terms, t.id))).toLocaleString()} coins · {terms.days} days
            {isFounder && (
              <button type="button" aria-label="Set the default price" onClick={() => openEdit(null)} className="rounded-lg px-1 text-[15px]">
                ✏️
              </button>
            )}
          </span>
          <span className="rounded-full bg-[#0B2A5B] px-3 py-1 text-xs font-bold text-[#6FE0A0]">🪙 {balance === null ? "…" : short(balance)}</span>
        </div>
        {message && <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{message}</p>}

        {/* my team: a hero card in the team's colours */}
        {current ? (
          <div className="relative mt-3 overflow-hidden rounded-[22px] p-4 text-white shadow-lg" style={{ background: supporterBackground(current) }}>
            <span className="pointer-events-none absolute -right-2 -top-6 select-none text-[86px] font-black leading-none text-white/10">{current.mark}</span>
            <div className="relative flex items-center gap-3">
              <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-white/95 shadow-md">
                <SupporterJersey team={current} size={54} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-bold tracking-[0.2em] text-white/75">MY TEAM</p>
                <p className="truncate text-xl font-black drop-shadow">{current.name}</p>
                <p className="text-xs text-white/85">
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left · until {fmtDate(mine.until)}
                </p>
              </div>
            </div>
            {/* how the name looks in a room */}
            <div className="relative mt-3 flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm">
              <span className="font-bold" style={{ color: current.text }}>
                {username || "you"}
              </span>
              <SupporterBadge team={current} size={9} />
              <span className="font-bold" style={{ color: current.text }}>
                :
              </span>
              <span className="text-[#222]">Come on! ⚽🔥</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-[22px] bg-gradient-to-r from-[#0E5E2E] via-[#1B9E4B] to-[#0F1B3D] p-4 text-white shadow-lg">
            <span className="text-[40px] leading-none">⚽</span>
            <div>
              <p className="text-base font-black">Pick your team</p>
              <p className="text-xs text-white/80">Your name in its colour + its crest in rooms and on your profile.</p>
            </div>
          </div>
        )}

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

        {/* 🔍 search */}
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-[#D5E3F5] bg-white px-3 py-2 shadow-sm">
          <span className="text-[#8A97B0]">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams… (FCB, Liverpool)"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#14213D] outline-none placeholder:text-[#A8B3C7]"
          />
          {search && (
            <button type="button" aria-label="Clear" onClick={() => setSearch("")} className="px-1 font-bold text-[#8A97B0]">
              ×
            </button>
          )}
        </div>

        {shownLeagues.length === 0 && <p className="py-10 text-center text-sm text-[#8A97B0]">No team found.</p>}
        {shownLeagues.map((l) => (
          <div key={l.id}>
            <SectionLabel>
              {l.flag} {l.name}
            </SectionLabel>
            {/* store grid: each card a soft wash of the team's colour behind its
                crest, the name, the price and a Buy pill in the team's colour */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {teamsOf(l.id).map((t) => {
                const isMine = current?.id === t.id;
                return (
                  <div
                    key={t.id}
                    className="relative overflow-hidden rounded-[18px] bg-white transition hover:-translate-y-0.5"
                    style={{ border: `1.5px solid ${isMine ? t.text : `${t.text}26`}`, boxShadow: `0 6px 16px ${t.text}1f` }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm(t)}
                      className="relative flex h-[96px] w-full items-center justify-center disabled:opacity-70"
                      style={{ background: `linear-gradient(160deg, ${t.text}38, ${t.text}0d 72%)` }}
                      aria-label={`Buy ${t.name}`}
                    >
                      <span className="absolute -right-7 -top-7 h-20 w-20 rounded-full" style={{ background: `${t.text}17` }} />
                      <span className="absolute -bottom-8 -left-6 h-16 w-16 rounded-full" style={{ background: `${t.text}12` }} />
                      <span className="relative drop-shadow-[0_4px_6px_rgba(0,0,0,.18)]">
                        <SupporterJersey team={t} size={64} />
                      </span>
                    </button>
                    {isMine && (
                      <span className="absolute left-2 top-2 rounded-full px-2 py-[2px] text-[9px] font-black text-white shadow" style={{ background: t.text }}>
                        ✓ MY TEAM
                      </span>
                    )}
                    {/* ✏️ this team's own price (miglife) */}
                    {isFounder && (
                      <button
                        type="button"
                        aria-label={`Set the ${t.name} price`}
                        onClick={() => openEdit(t)}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-[13px] shadow-sm"
                      >
                        ✏️
                      </button>
                    )}
                    <div className="px-2.5 pb-2.5 pt-2">
                      <p className="truncate text-[13.5px] font-extrabold leading-5" style={{ color: t.text }}>
                        {t.name}
                      </p>
                      <p className="text-[10.5px] font-semibold text-[#8A97B0]">
                        {t.mark} · {terms.days} days
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className="text-[13.5px] font-black text-[#14213D]">🪙 {compact(supporterPriceOf(terms, t.id))}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirm(t)}
                          className="rounded-full px-3 py-1 text-[11.5px] font-bold text-white shadow disabled:opacity-60"
                          style={{ background: `linear-gradient(135deg, ${t.text}, ${t.text}c8)` }}
                        >
                          {isMine ? "+ Days" : "Buy"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="mt-6 px-1 text-center text-[11px] leading-5 text-[#8A97B0]">
          Fan colours only. miGlife is not connected with any football club or league; team names belong to their owners.
          Your badge shows when you enter or leave a room, in the room's people list and on your profile.
        </p>
      </section>

      {confirm && (() => {
        const price = supporterPriceOf(terms, confirm.id);
        const canAfford = balance !== null && balance >= price;
        return (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-6" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-[#14213D] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <SupporterJersey team={confirm} size={44} />
              <p className="text-lg font-extrabold" style={{ color: confirm.text }}>
                {confirm.name}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#3D4A60]">
              {current && current.id === confirm.id
                ? `Add ${terms.days} more days`
                : current
                  ? `Switch from ${current.name} — your days left move to ${confirm.name}, plus ${terms.days} days`
                  : `The ${confirm.name} (${confirm.short}) supporters badge for ${terms.days} days`}{" "}
              for <b>{price.toLocaleString()} coins</b>.
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
        );
      })()}
      {editing && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-6" onClick={() => setEditing(false)}>
          <div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-[#14213D] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold">✏️ {editTeam ? `${editTeam.name} price` : "Supporters Badge price"}</p>
            <p className="mt-1 text-xs text-[#5B6B8C]">
              {editTeam
                ? `Only for ${editTeam.name}. Default for other teams: ${terms.price.toLocaleString()} coins. New buys use it at once.`
                : "The default for every team without its own price (✏️ on a team). New buys use it at once."}
            </p>
            <label className="mt-3 block text-xs font-bold text-[#35507E]">
              Price (coins)
              <input
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-[#D5E3F5] px-3 py-2 text-base font-semibold outline-none focus:border-[#2F6ABD]"
              />
            </label>
            {editTeam && (
              <div className="mt-3 rounded-xl border border-[#D5E3F5] p-3">
                <p className="text-xs font-bold text-[#35507E]">📷 Picture (instead of the crest)</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow">
                    <SupporterJersey team={editTeam} size={40} />
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <label className={`cursor-pointer rounded-full bg-[#0B2A5B] px-3 py-1.5 text-xs font-bold text-white ${picBusy ? "opacity-60" : ""}`}>
                      {picBusy ? "Saving…" : pictures[editTeam.id] ? "Change" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={picBusy}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          e.target.value = "";
                          if (f) savePicture(editTeam, f);
                        }}
                      />
                    </label>
                    {pictures[editTeam.id] && (
                      <button type="button" disabled={picBusy} onClick={() => savePicture(editTeam, null)} className="px-1 text-xs font-bold text-[#D9534F]">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!editTeam && (
            <label className="mt-3 block text-xs font-bold text-[#35507E]">
              Days
              <input
                value={editDays}
                onChange={(e) => setEditDays(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-[#D5E3F5] px-3 py-2 text-base font-semibold outline-none focus:border-[#2F6ABD]"
              />
            </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {editTeam && terms.prices[editTeam.id] !== undefined && (
                <button type="button" onClick={() => savePrice(true)} className="mr-auto px-1 py-2 text-sm font-bold text-[#D9534F]">
                  Use default
                </button>
              )}
              <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-[#D5E3F5] px-5 py-2 text-sm font-bold text-[#5B6B8C]">
                Cancel
              </button>
              <button type="button" onClick={() => savePrice()} className="rounded-full bg-[#2F6ABD] px-5 py-2 text-sm font-bold text-white">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
