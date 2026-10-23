"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, doc, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { RefreshButton } from "../_components/RefreshButton";
import { Face, profileImageUrl } from "../_components/RankFace";

// Explore › Gift Contest, like the app. Everyone reads app_settings/gift_contest
// (live flag, prize, rules). The standings need the contest room and time window
// from app_settings/gift_contest_admin, which only migwith can read; editing the
// contest stays in the app.
// 🎁 Royal look (like the Luxury Festival): prize and rules cards, the room and
// gift as chips, the 1-2-3 podium with profile pictures, then the rest.

type Admin = { room: string; gift: string; start: Timestamp | null; end: Timestamp | null };
type Row = { name: string; count: number };

// "YYYY-MM-DD" + hour:minute in Asia/Dhaka (UTC+6, no DST), same as the app and functions.
function dhaka(date: string, hour: number, minute: number): Timestamp | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Timestamp.fromMillis(Date.UTC(y, m - 1, d, hour - 6, minute));
}

const pad = (n: number) => String(n).padStart(2, "0");
function parts(ms: number): [string, string][] {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    [String(Math.floor(s / 86400)), "DAYS"],
    [pad(Math.floor((s % 86400) / 3600)), "HRS"],
    [pad(Math.floor((s % 3600) / 60)), "MIN"],
    [pad(s % 60), "SEC"],
  ];
}
const niceMs = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const gifts = (n: number) => (n === 1 ? "1 gift" : `${n} gifts`);

const BG = "radial-gradient(120% 60% at 50% 0%, #A0287A 0%, #4A1150 55%, #1E0A2E 100%)";
const PINK = "#FF9AD5";
const PODIUM = [
  { ring: "linear-gradient(#FFE08A,#E0A100)", step: "linear-gradient(#FF8AD0,#C2287F)", text: "#FFD36E", h: 84 },
  { ring: "linear-gradient(#E3E8F0,#9AA6B8)", step: "linear-gradient(#C9D2E0,#7E8AA0)", text: "#D6DEEA", h: 58 },
  { ring: "linear-gradient(#F3B68A,#B8642A)", step: "linear-gradient(#E9A070,#9C5222)", text: "#F3C29E", h: 44 },
];

export default function GiftContestPage() {
  const ready = useRequireLogin();
  const { username } = useCurrentUser();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [prize, setPrize] = useState("");
  const [rules, setRules] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tick, setTick] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const off = onSnapshot(
      doc(db, "app_settings", "gift_contest"),
      (snap) => {
        setActive(snap.get("active") === true);
        setPrize(String(snap.get("prizeDescription") || ""));
        setRules(String(snap.get("rulesText") || ""));
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    // Readable only by migwith; everyone else gets permission-denied and no standings.
    const offAdmin = onSnapshot(
      doc(db, "app_settings", "gift_contest_admin"),
      (snap) => {
        const date = String(snap.get("startDate") || "");
        const start = dhaka(date, Number(snap.get("startHour") || 0), Number(snap.get("startMinute") || 0));
        const hours = Number(snap.get("durationHours") ?? 24);
        setAdmin({
          room: String(snap.get("roomName") || ""),
          gift: String(snap.get("giftName") || ""),
          start,
          end: start && hours > 0 ? Timestamp.fromMillis(start.toMillis() + hours * 3_600_000) : null,
        });
      },
      () => setAdmin(null)
    );
    return () => {
      off();
      offAdmin();
    };
  }, [ready]);

  useEffect(() => {
    if (!admin?.room) return;
    setRows(null);
    const parts = [where("roomId", "==", admin.room)];
    if (admin.start) parts.push(where("createdAt", ">=", admin.start));
    if (admin.end) parts.push(where("createdAt", "<=", admin.end));
    getDocs(query(collection(db, "gift_activity"), ...parts))
      .then((snap) => {
        const counts = new Map<string, number>();
        snap.docs.forEach((d) => {
          if (admin.gift && d.get("giftName") !== admin.gift) return;
          const from = String(d.get("fromUsername") || "").trim();
          if (from) counts.set(from, (counts.get(from) || 0) + 1);
        });
        setRows(
          Array.from(counts, ([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)
        );
      })
      .catch(() => setRows([]));
  }, [admin, tick]);

  // Profile pictures of the gifters (by username, 10 per read), each read once.
  const nameKey = (rows || []).map((r) => r.name).join(",");
  useEffect(() => {
    const want = nameKey.split(",").filter((n) => n && !(n in photos));
    if (!want.length) return;
    let gone = false;
    const chunks: string[][] = [];
    for (let i = 0; i < want.length; i += 10) chunks.push(want.slice(i, i + 10));
    Promise.all(chunks.map((c) => getDocs(query(collection(db, "users"), where("username", "in", c))).catch(() => null))).then((snaps) => {
      if (gone) return;
      const got: Record<string, string> = Object.fromEntries(want.map((n) => [n, ""]));
      snaps.forEach((q) => q?.docs.forEach((d) => (got[String(d.get("username") || "")] = profileImageUrl(d.data()))));
      setPhotos((p) => ({ ...p, ...got }));
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKey]);

  const startMs = admin?.start?.toMillis() ?? null;
  const endMs = admin?.end?.toMillis() ?? null;
  const live = loaded && active;
  const counting = live && endMs !== null && now < endMs;
  const list = rows || [];
  const top = list[0]?.count || 0;
  const myIndex = username ? list.findIndex((r) => r.name.toLowerCase() === username.toLowerCase()) : -1;
  const gap = myIndex > 0 ? list[myIndex - 1].count - list[myIndex].count + 1 : null;

  return (
    <PageShell light>
      <div className="min-h-[calc(100dvh-57px)] text-white" style={{ background: BG }}>
        <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
          {/* header */}
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
              <h1 className="text-xl font-black">🎁 Gift Contest</h1>
              <p className="text-[10.5px] font-extrabold tracking-[0.15em] text-[#FFB3DE]">LIVE CONTEST · TOP GIFTERS</p>
            </div>
            <RefreshButton
              onClick={() => setTick((t) => t + 1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white"
            />
          </div>

          {!loaded ? (
            <p className="py-16 text-center text-sm text-white/70">Loading…</p>
          ) : !live && !prize && !rules ? (
            /* no contest right now */
            <div className="rounded-[20px] border border-dashed border-white/25 bg-white/[.07] px-4 py-6 text-center">
              <p className="text-[40px] leading-none">🎁💤</p>
              <p className="mt-2 text-[15px] font-extrabold">No contest right now</p>
              <p className="mt-1 text-[12.5px] text-white/75">
                The next Gift Contest is coming soon. Watch Alerts and Announcements — the top gifters win prizes! 🏆
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Link href="/announcements" className="rounded-full bg-[#FF5CC8] px-3 py-1.5 text-[12px] font-bold text-white">
                  <span className="inline-block -scale-x-100">📢</span> Announcements
                </Link>
                <Link href="/gifts" className="rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold">
                  🎁 Gift Store
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* status, countdown, room and gift */}
              <div className="rounded-[20px] border border-white/10 bg-white/[.08] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                    style={live ? { background: "rgba(46,229,157,.15)", color: "#7CF5C4" } : { background: "rgba(255,255,255,.1)", color: "#D6CCF0" }}
                  >
                    <i className="h-[7px] w-[7px] rounded-full" style={{ background: live ? "#2EE59D" : "#A99BD0" }} />
                    {live ? "LIVE" : "NOT RUNNING"}
                  </span>
                  {endMs !== null && <span className="truncate text-[11.5px] text-white/75">ends {niceMs(endMs)}</span>}
                </div>
                {counting && (
                  <div className="mt-2.5 flex gap-1.5">
                    {parts((startMs !== null && now < startMs ? startMs : endMs!) - now).map(([v, l]) => (
                      <div key={l} className="flex-1 rounded-xl bg-black/25 py-1.5 text-center">
                        <b className="block text-lg tabular-nums" style={{ color: PINK }}>
                          {v}
                        </b>
                        <span className="text-[9px] font-bold tracking-wider text-white/70">{l}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(admin?.room || admin?.gift) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {admin?.room && (
                      <span data-notranslate className="rounded-full bg-white/[.12] px-2.5 py-1 text-[11.5px] font-bold">
                        🏠 {admin.room} room
                      </span>
                    )}
                    {admin?.gift && (
                      <span data-notranslate className="rounded-full bg-white/[.12] px-2.5 py-1 text-[11.5px] font-bold">
                        🎁 {admin.gift} only
                      </span>
                    )}
                  </div>
                )}
              </div>

              {prize && (
                <div className="mt-2.5 rounded-[18px] border border-[#FFD36E55] p-3" style={{ background: "linear-gradient(135deg,rgba(255,211,110,.22),rgba(255,211,110,.06))" }}>
                  <p className="text-[12px] font-black tracking-wider text-[#FFD36E]">🏆 PRIZE</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5">{prize}</p>
                </div>
              )}
              {rules && (
                <div className="mt-2.5 rounded-[18px] border border-white/10 bg-white/[.06] p-3">
                  <p className="text-[12px] font-black tracking-wider text-[#8FD3FF]">📜 RULES</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-white/85">{rules}</p>
                </div>
              )}

              {/* standings */}
              {!admin?.room ? (
                <p className="mt-6 px-1 text-center text-[12.5px] text-white/60">🏆 The top gifters will be announced when the contest ends.</p>
              ) : rows === null ? (
                <p className="mt-6 text-center text-sm text-white/70">Loading…</p>
              ) : list.length === 0 ? (
                <p className="mt-6 text-center text-sm text-white/70">No gifts sent yet — be the first! 🎁</p>
              ) : (
                <>
                  <div className="mb-3 mt-7 flex items-end gap-2">
                    {[1, 0, 2].map((i) => {
                      const p = list[i];
                      const look = PODIUM[i];
                      if (!p) return <div key={i} className="flex-1" />;
                      return (
                        <Link key={p.name} href={`/profile/${encodeURIComponent(p.name)}`} className="min-w-0 flex-1 text-center">
                          <div className="relative mx-auto w-fit">
                            {i === 0 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[22px]">👑</span>}
                            <Face name={p.name} url={photos[p.name]} size={i === 0 ? 70 : 56} ring={look.ring} glow={i === 0 ? "#FF5CC8" : undefined} />
                          </div>
                          <p data-notranslate className={`mt-1.5 truncate font-extrabold ${i === 0 ? "text-[15px]" : "text-[13.5px]"}`}>
                            {p.name}
                          </p>
                          <p className="text-[11.5px] font-extrabold" style={{ color: look.text }}>
                            🎁 {p.count.toLocaleString()}
                          </p>
                          <div
                            className="mt-2 flex items-start justify-center rounded-t-[14px] rounded-b-[4px] pt-2 text-[22px] font-black text-white"
                            style={{ height: look.h, background: look.step }}
                          >
                            {i + 1}
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  <ul className="space-y-[7px]">
                    {list.slice(3).map((r, k) => {
                      const mine = k + 3 === myIndex;
                      return (
                        <li key={r.name}>
                          <Link
                            href={`/profile/${encodeURIComponent(r.name)}`}
                            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${mine ? "border-[#FF5CC877] bg-[#FF5CC8]/15" : "border-white/10 bg-white/[.07]"}`}
                          >
                            <span className="w-7 text-center text-sm font-black text-[#FFB3DE]">{k + 4}</span>
                            <Face name={r.name} url={photos[r.name]} size={38} />
                            <span className="min-w-0 flex-1">
                              <span data-notranslate className="block truncate text-[14.5px] font-bold">
                                {r.name}
                              </span>
                              {top > 0 && (
                                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                                  <i
                                    className="block h-full rounded-full"
                                    style={{ width: `${Math.max(2, Math.round((r.count / top) * 100))}%`, background: "linear-gradient(90deg,#FF5CC8,#FFD36E)" }}
                                  />
                                </span>
                              )}
                            </span>
                            <span className="whitespace-nowrap text-[13.5px] font-black" style={{ color: PINK }}>
                              🎁 {gifts(r.count)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>

                  {myIndex >= 0 && (
                    <div
                      className="mt-3 flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                      style={{ background: "linear-gradient(90deg,rgba(255,92,200,.28),rgba(255,92,200,.08))", borderColor: "#FF5CC877" }}
                    >
                      <span className="w-7 text-center text-sm font-black" style={{ color: PINK }}>
                        #{myIndex + 1}
                      </span>
                      <Face name={list[myIndex].name} url={photos[list[myIndex].name]} size={38} ring="linear-gradient(#FF9AD5,#C2287F)" />
                      <span className="min-w-0 flex-1">
                        <span data-notranslate className="block truncate text-[14.5px] font-bold">
                          You · {list[myIndex].name}
                        </span>
                        <span className="block text-[11px] text-white/75">
                          {myIndex === 0 ? "👑 You are on top — keep it up!" : `🎁 ${gifts(gap!)} more to reach #${myIndex}`}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-[13.5px] font-black" style={{ color: PINK }}>
                        🎁 {list[myIndex].count.toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
