"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";

// Explore › Gift Contest, like the app. Everyone reads app_settings/gift_contest
// (live flag, prize, rules). The standings need the contest room and time window
// from app_settings/gift_contest_admin, which only migwith can read; editing the
// contest stays in the app.

type Admin = { room: string; gift: string; start: Timestamp | null; end: Timestamp | null };
type Row = { name: string; count: number };

// "YYYY-MM-DD" + hour:minute in Asia/Dhaka (UTC+6, no DST), same as the app and functions.
function dhaka(date: string, hour: number, minute: number): Timestamp | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Timestamp.fromMillis(Date.UTC(y, m - 1, d, hour - 6, minute));
}

export default function GiftContestPage() {
  const ready = useRequireLogin();
  const [active, setActive] = useState(false);
  const [prize, setPrize] = useState("");
  const [rules, setRules] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

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
  }, [admin]);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title="Gift Contest" subtitle="Live contest · Top Gifters" icon="🎁" />

        <div className="rounded-2xl bg-[#141B33] p-4 text-white shadow-md">
          <p className={`text-sm font-bold ${active ? "text-[#4CD97B]" : "text-[#9FA6BE]"}`}>
            {!loaded ? "Loading…" : active ? "🟢 Contest is LIVE" : "⚪ No active contest"}
          </p>
          {loaded && !prize && !rules && <p className="mt-1 text-sm text-white/60">No contest rules have been set yet.</p>}
          {prize && (
            <>
              <p className="mt-3 text-sm font-black text-[#F5D77A]">🏆 Prize</p>
              <p className="whitespace-pre-wrap text-sm text-white/85">{prize}</p>
            </>
          )}
          {rules && (
            <>
              <p className="mt-3 text-sm font-black text-[#8FD3FF]">📜 Rules</p>
              <p className="whitespace-pre-wrap text-sm text-white/85">{rules}</p>
            </>
          )}
        </div>

        <SectionLabel>{admin?.room ? `Top Gifters — ${admin.room}` : "Top Gifters"}</SectionLabel>
        {!admin?.room ? (
          <p className="px-1 text-sm text-[#5B6B8C]">The contest room hasn&apos;t been set yet.</p>
        ) : rows === null ? (
          <p className="px-1 text-sm text-[#5B6B8C]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-1 text-sm text-[#5B6B8C]">No gifts sent yet in this window.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.name}>
                <Link
                  href={`/profile/${encodeURIComponent(r.name)}`}
                  className="flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm hover:bg-[#F4F9FF]"
                >
                  <span className="w-8 text-center font-black text-[#B7791F]">{["🥇", "🥈", "🥉"][i] || `#${i + 1}`}</span>
                  <span data-notranslate className="min-w-0 flex-1 truncate font-bold text-[#0B2A5B]">
                    {r.name}
                  </span>
                  <span className="text-sm font-bold text-[#E12A2A]">{r.count === 1 ? "1 gift" : `${r.count} gifts`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
