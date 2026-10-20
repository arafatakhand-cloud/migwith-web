"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import {
  amount,
  Avatar,
  DAY,
  DateBar,
  dayRange,
  daysLeft,
  EarningPanel,
  lc,
  ProgramBar,
  spendBetween,
  todayStr,
  trailReport,
  uidsFor,
  checkTagFree,
} from "../_components/ProgramShared";
import { isMainFounderName } from "../../lib/founder";
import { useTransferLimits } from "../../lib/transferLimits";

// Explore › Merchant Program › Mentor Dashboard, same documents and rules as
// the app's MentorDashboardPage / MentorReportPage / MentorEarningsPage:
//  DASHBOARD  mentor_requests (approve / reject), mentor_merchants, mentor_tagged,
//             "Tag User" → mentor_tag_requests + an alert for that user.
//  REPORT     one day's trail: 3% of each tagged user's spend after they were
//             tagged, plus 0.5% of the spend of users your merchants tagged.
//  EARNING    mentor_earnings/{username} (server totals) and your coin balance.

const approveMerchantRole = httpsCallable<
  { requestId: string; mentorUsername: string; merchantUsername: string; operationId: string },
  { ok: boolean; paid?: number }
>(functions, "approveMerchantRole");

const MAX_MERCHANTS = 15;

// Kept while the app is open: coming back (or switching tabs) shows the last
// numbers at once and fresh ones replace them quietly — never a "Loading…".
const allowedMemory = new Map<string, boolean>();
const reportMemory = new Map<string, { direct: Row[]; merchant: Row[] }>();

export default function MentorDashboardPage() {
  const ready = useRequireLogin();
  const { user, username } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(() => (user ? allowedMemory.get(user.uid) ?? null : null));
  const [panel, setPanel] = useState<"DASHBOARD" | "REPORT" | "EARNING">("DASHBOARD");
  const [refresh, setRefresh] = useState(0);
  const router = useRouter();

  // Mentors (and migwith) only — same check as the app's Merchant Program page.
  useEffect(() => {
    if (!user || !username) return;
    getDoc(doc(db, "users", user.uid))
      .then((s) => {
        const role = lc(String(s.get("role") || ""));
        const roles = ((s.get("roles") as unknown[]) || []).map((r) => lc(String(r)));
        const ok = role === "mentor" || roles.includes("mentor") || isMainFounderName(username);
        allowedMemory.set(user.uid, ok);
        setAllowed(ok);
      })
      .catch(() => setAllowed(allowedMemory.get(user.uid) ?? false));
  }, [user, username]);

  // 🔒 not a mentor (and not miGlife): the dashboard is never shown — straight
  // to miGlife Partner, where they can join as a merchant.
  useEffect(() => {
    if (allowed === false) router.replace("/merchant");
  }, [allowed, router]);
  if (allowed !== true) return <PageShell light>{null}</PageShell>;

  return (
    <PageShell light>
      <ProgramBar
        // ← goes back where you came from (miGlife Partner) instead of opening
        // it again on top — that made the two pages send you to each other.
        onBack={() => (window.history.length > 1 ? router.back() : router.push("/merchant"))}
        panels={["DASHBOARD", "REPORT", "EARNING"] as const}
        panel={panel}
        setPanel={setPanel}
        onRefresh={() => setRefresh((n) => n + 1)}
        accent="#1E63D6"
        gold
      />

      {/* light, in the chosen colour theme like the rest of the app */}
      <section className="mx-auto min-h-[calc(100dvh-110px)] max-w-4xl bg-[#EEF3FB] pb-10 text-[#0B2A5B]">
        {!ready ? null : panel === "DASHBOARD" ? (
          <Dashboard me={username} refresh={refresh} />
        ) : panel === "REPORT" ? (
          <Report me={username} refresh={refresh} />
        ) : (
          <EarningPanel kind="mentor" me={username} uid={user!.uid} refresh={refresh} gold />
        )}
      </section>
    </PageShell>
  );
}

/* ----------------------------------------------------------------- DASHBOARD */

function Dashboard({ me, refresh }: { me: string; refresh: number }) {
  const [tab, setTab] = useState<"REQUESTS" | "MERCHANTS" | "TAGGED">("REQUESTS");
  const [requests, setRequests] = useState<DocumentSnapshot[]>([]);
  const [merchants, setMerchants] = useState<DocumentSnapshot[]>([]);
  const [tagged, setTagged] = useState<DocumentSnapshot[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  useEffect(() => {
    const off1 = onSnapshot(
      query(collection(db, "mentor_requests"), where("toMentor", "==", me), where("status", "==", "pending")),
      (s) => setRequests(s.docs),
      () => {}
    );
    const off2 = onSnapshot(query(collection(db, "mentor_merchants"), where("mentorUsername", "==", me)), (s) => setMerchants(s.docs), () => {});
    const off3 = onSnapshot(query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me)), (s) => setTagged(s.docs), () => {});
    return () => {
      off1();
      off2();
      off3();
    };
  }, [me, refresh]);

  // Live tagged-user count per merchant (the stored taggedUsersCount is never updated).
  const merchantKey = merchants.map((m) => m.get("merchantUsername")).join("|");
  useEffect(() => {
    const names = Array.from(new Set(merchants.map((m) => String(m.get("merchantUsername") || "").trim()).filter(Boolean)));
    if (!names.length) return;
    const chunks: string[][] = [];
    for (let i = 0; i < names.length; i += 10) chunks.push(names.slice(i, i + 10));
    Promise.all(
      chunks.map((c) => getDocs(query(collection(db, "merchant_tagged"), where("merchantUsername", "in", c), where("status", "==", "active"))))
    )
      .then((snaps) => {
        const m: Record<string, number> = {};
        snaps.forEach((s) => s.docs.forEach((d) => {
          const k = String(d.get("merchantUsername") || "");
          m[k] = (m[k] || 0) + 1;
        }));
        setCounts(m);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantKey]);

  const withBusy = async (key: string, run: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(key));
    setMsg("");
    try {
      await run();
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong.");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  };

  const acceptCoins = useTransferLimits().merchantAcceptCoins;
  const approve = (req: DocumentSnapshot) =>
    withBusy(req.id, async () => {
      const from = String(req.get("fromUsername") || "");
      const already = merchants.some((m) => lc(String(m.get("merchantUsername") || "")) === lc(from));
      if (!already && merchants.length >= MAX_MERCHANTS) throw new Error(`A mentor can have at most ${MAX_MERCHANTS} merchants.`);
      // 🔒 approveMerchantRole (server) does everything: marks the request
      // approved, gives the merchant role, and writes the mentor ↔ merchant
      // link + the 30-day tag. Phones can't write those any more.
      // 💸 accepting sends the new merchant coins from the mentor (miGlife sets how many)
      const { data } = await approveMerchantRole({ requestId: req.id, mentorUsername: me, merchantUsername: from, operationId: crypto.randomUUID() });
      const paid = Number(data?.paid || 0);
      setMsg(`✅ @${from} is now your merchant (30 days)${paid > 0 ? ` · ${paid.toLocaleString("en-US")} coins sent` : ""}.`);
    });

  const reject = (req: DocumentSnapshot) => withBusy(req.id, () => updateDoc(req.ref, { status: "rejected" }));

  return (
    <>
      <div className="flex gap-2 px-3 pt-3 text-[12px] font-bold">
        {(
          [
            ["REQUESTS", "Requests", requests.length, true],
            ["MERCHANTS", "Merchants", merchants.length, false],
            ["TAGGED", "Tagged", tagged.length, false],
          ] as const
        ).map(([id, label, n, alert]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 ${tab === id ? "bg-[#1E63D6] text-white shadow" : "bg-white text-[#5B6B8C] shadow-sm"}`}
          >
            {label}
            {n > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] ${alert ? "bg-[#E5484D] text-white" : tab === id ? "bg-white text-[#1E63D6]" : "bg-[#1E63D6]/10 text-[#1E63D6]"}`}>{n}</span>
            )}
          </button>
        ))}
      </div>
      {msg && <p className="mx-3 mt-3 rounded-xl border border-[#D5E3F5] bg-white shadow-sm px-4 py-2 text-sm font-semibold text-[#1E63D6]">{msg}</p>}

      <div className="space-y-2 px-3 py-3">
        {tab === "REQUESTS" &&
          (requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#5B6B8C]">No pending requests.</p>
          ) : (
            requests.map((r) => {
              const from = String(r.get("fromUsername") || "");
              const note = String(r.get("note") || "");
              const country = String(r.get("country") || "");
              return (
                <div key={r.id} className="rounded-2xl bg-white shadow-sm p-4 text-[#0B2A5B]">
                  <div className="flex items-center gap-3">
                    <Avatar name={from} size="h-10 w-10" />
                    <div className="min-w-0">
                      <p data-notranslate className="font-bold">@{from}</p>
                      <p className="text-xs text-[#5B6B8C]">Level {Number(r.get("level") || 0)}{country && ` · ${country}`} · wants to be your merchant</p>
                    </div>
                  </div>
                  {note && <p data-notranslate className="mt-2 text-xs text-[#5B6B8C]">&ldquo;{note}&rdquo;</p>}
                  <div className="mt-3 flex gap-2.5">
                    <button type="button" disabled={busy.has(r.id)} onClick={() => reject(r)} className="flex-1 rounded-xl border border-[#E5484D]/60 py-2 text-sm font-bold text-[#E5484D] disabled:opacity-40">
                      ✕ Reject
                    </button>
                    <button type="button" disabled={busy.has(r.id)} onClick={() => approve(r)} className="flex-[1.4] rounded-xl bg-gradient-to-r from-[#22C55E] to-[#16A34A] py-2 text-sm font-black text-white disabled:opacity-40">
                      {busy.has(r.id) ? "…" : acceptCoins > 0 ? `✓ Approve · ${acceptCoins % 1000 === 0 ? `${acceptCoins / 1000}K` : acceptCoins}` : "✓ Approve"}
                    </button>
                  </div>
                </div>
              );
            })
          ))}

        {tab === "MERCHANTS" &&
          (merchants.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#5B6B8C]">No merchants yet.</p>
          ) : (
            merchants.map((m) => {
              const name = String(m.get("merchantUsername") || "");
              const left = daysLeft(m.get("expiresAt"));
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white shadow-sm px-3 py-2.5 text-[#0B2A5B]">
                  <Avatar name={name} size="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p data-notranslate className="truncate font-bold">@{name}</p>
                    <p className="text-xs text-[#5B6B8C]">{counts[name] ?? Number(m.get("taggedUsersCount") || 0)} tagged users</p>
                  </div>
                  {left !== null && (
                    <span className="rounded-full bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD] px-2.5 py-0.5 text-[11px] font-black text-white">{left}d left</span>
                  )}
                </div>
              );
            })
          ))}

        {tab === "TAGGED" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold tracking-wider text-[#5B6B8C]">TAGGED · 3% BONUS</p>
              <button
                type="button"
                onClick={() => setTagOpen(true)}
                className="rounded-xl bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD] px-4 py-2 text-xs font-black text-white shadow"
              >
                + TAG USER
              </button>
            </div>
            {tagged.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#5B6B8C]">No tagged users yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tagged.map((t) => {
                  const name = String(t.get("taggedUsername") || "");
                  const status = String(t.get("status") || "active");
                  const left = daysLeft(t.get("expiresAt"));
                  // the ring: how much of the 30-day tag is left
                  const part = left === null ? 0 : Math.max(0, Math.min(100, (left / 30) * 100));
                  return (
                    <div key={t.id} className="relative rounded-2xl bg-white shadow-sm p-3 text-center">
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        disabled={busy.has(t.id)}
                        onClick={() => confirm(`Remove @${name} from your tagged users?`) && withBusy(t.id, () => deleteDoc(t.ref))}
                        className="absolute right-2 top-2 text-sm text-[#E5484D] disabled:opacity-40"
                      >
                        🗑
                      </button>
                      <div className="relative mx-auto h-14 w-14">
                        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                          <circle cx="18" cy="18" r="16" fill="none" className="stroke-[#E3ECF7]" strokeWidth="3" />
                          <circle cx="18" cy="18" r="16" fill="none" className="stroke-[#1E63D6]" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${part} 100`} pathLength={100} />
                        </svg>
                        <span className="absolute inset-[7px] flex">
                          <Avatar name={name} size="h-full w-full" />
                        </span>
                      </div>
                      <p data-notranslate className="mt-1 truncate text-[13px] font-bold">@{name}</p>
                      <p className="text-[10px] text-[#5B6B8C]">
                        {status === "active" ? (left !== null ? `${left} days left` : "Tagged") : status}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {tagOpen && <TagUserDialog me={me} onClose={() => setTagOpen(false)} onDone={(t) => setMsg(`Tag request sent to @${t}.`)} />}
    </>
  );
}

function TagUserDialog({ me, onClose, onDone }: { me: string; onClose: () => void; onDone: (target: string) => void }) {
  const [target, setTarget] = useState("");
  const [amt, setAmt] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const name = target.trim().replace(/^@/, "").trim();
    const tagAmount = Number(amt);
    if (!name || lc(name) === lc(me)) return setError("Enter another user's username.");
    if (!Number.isFinite(tagAmount) || tagAmount < 5000) return setError("Tag amount must be at least 5000 Coins.");
    setBusy(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "users"), where("username", "==", name), limit(1)));
      const u = snap.docs[0];
      if (!u) throw new Error("User not found.");
      if (lc(String(u.get("role") || "")) === "merchant") throw new Error("A mentor cannot tag a merchant.");
      const existing = await getDocs(
        query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me), where("taggedUsername", "==", name), where("status", "==", "active"), limit(1))
      );
      if (!existing.empty) throw new Error("This user is already tagged.");
      const busyMsg = await checkTagFree(name, me);
      if (busyMsg) throw new Error(busyMsg);
      const req = doc(collection(db, "mentor_tag_requests"));
      await setDoc(req, {
        mentorUsername: me,
        taggedUsername: name,
        taggedUid: u.id,
        amount: tagAmount,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "alerts"), {
        toUsername: name,
        fromUsername: me,
        requestId: req.id,
        amount: tagAmount,
        type: "mentor_tag_request",
        message: `@${me} wants to tag you. Tag amount: ${tagAmount} coins`,
        read: false,
        createdAt: serverTimestamp(),
      });
      onDone(name);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Could not send tag request.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm text-[#0B2A5B] outline-none focus:border-[#2F80ED]";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black">💼 Tag User</h2>
        <p className="text-xs text-[#5B6B8C]">Tag amount — minimum 5000 Coins, no maximum</p>
        <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Amount (min 5000)" className={field} />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username" className={field} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]">
            Cancel
          </button>
          <button type="button" onClick={send} disabled={busy || !target.trim()} className="flex-1 rounded-xl bg-[#7B1FB8] py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- REPORT */

type Row = { username: string; spend: number; earning: number };

// One day's trail, the same calculation as the app's fetchMentorTagTrailForDate.
async function trailForDay(me: string, day: string): Promise<{ direct: Row[]; merchant: Row[] }> {
  const { start, end } = dayRange(day);
  const later = (a: Timestamp, b: Timestamp | null) => (b && b.toMillis() > a.toMillis() ? b : a);

  const [taggedSnap, merchSnap] = await Promise.all([
    getDocs(query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me), where("status", "==", "active"))),
    getDocs(query(collection(db, "mentor_merchants"), where("mentorUsername", "==", me))),
  ]);
  const myMerchants = new Set(merchSnap.docs.map((x) => lc(String(x.get("merchantUsername") || ""))));
  const tagFrom = new Map<string, Timestamp>();
  taggedSnap.docs.forEach((t) => {
    const n = String(t.get("taggedUsername") || "").trim();
    if (n) tagFrom.set(n, later(start, (t.get("createdAt") as Timestamp) || null));
  });
  const names = Array.from(tagFrom.keys());
  const merchantNames = names.filter((n) => myMerchants.has(lc(n)));

  // Users each of my merchants tagged (not merchants themselves).
  const downstream = new Map<string, { name: string; at: Timestamp | null }[]>();
  await Promise.all(
    merchantNames.map(async (mn) => {
      const s = await getDocs(query(collection(db, "merchant_tagged"), where("merchantUsername", "==", mn), where("status", "==", "active")));
      downstream.set(
        mn,
        s.docs
          .map((x) => ({ name: String(x.get("taggedUsername") || "").trim(), at: (x.get("createdAt") as Timestamp) || null }))
          .filter((x) => x.name)
      );
    })
  );
  const allDown = Array.from(new Set(Array.from(downstream.values()).flat().map((x) => x.name)));
  const becameMerchant = new Set<string>();
  for (let i = 0; i < allDown.length; i += 10) {
    const s = await getDocs(query(collection(db, "mentor_merchants"), where("merchantUsername", "in", allDown.slice(i, i + 10))));
    s.docs.forEach((x) => becameMerchant.add(String(x.get("merchantUsername"))));
  }
  const uids = await uidsFor([...names, ...allDown.filter((n) => !becameMerchant.has(n))]);
  const spendFor = (name: string, from: Timestamp) => {
    const uid = uids.get(name);
    return uid ? spendBetween(uid, name, from, end) : Promise.resolve(0);
  };

  const direct: Row[] = [];
  const merchant: Row[] = [];
  await Promise.all(
    names.map(async (n) => {
      const own = await spendFor(n, tagFrom.get(n)!);
      direct.push({ username: n, spend: own, earning: (own * 3) / 100 });
      if (myMerchants.has(lc(n))) {
        const parts = await Promise.all(
          (downstream.get(n) || [])
            .filter((x) => !becameMerchant.has(x.name))
            .map((x) => spendFor(x.name, later(tagFrom.get(n)!, x.at)))
        );
        const down = parts.reduce((a, b) => a + b, 0);
        merchant.push({ username: n, spend: down, earning: (down * 0.5) / 100 });
      }
    })
  );
  const byName = (a: Row, b: Row) => a.username.toLowerCase().localeCompare(b.username.toLowerCase());
  return { direct: direct.sort(byName), merchant: merchant.sort(byName) };
}

function Report({ me, refresh }: { me: string; refresh: number }) {
  const [day, setDay] = useState(todayStr);
  const [data, setData] = useState(() => reportMemory.get(`${me}|${todayStr()}`) || null);
  const [before, setBefore] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(reportMemory.get(`${me}|${day}`) || null);
    setError("");
    const prev = dayBefore(day);
    const kept = reportMemory.get(`${me}|${prev}`);
    setBefore(kept ? sumAll(kept) : null);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Loading took too long. Tap ⟳ to try again.")), 40_000));
    Promise.race([loadReport(me, day), timeout])
      .then((r) => {
        if (cancelled) return;
        setData(r);
        // The day before, for "▲ 18% vs yesterday" (quietly, after).
        loadReport(me, prev)
          .then((y) => !cancelled && setBefore(sumAll(y)))
          .catch(() => {});
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || String(e));
        setData({ direct: [], merchant: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [me, day, refresh]);

  // First time for this day: shown at once with zeros, the cards fill in.
  const shown = data || { direct: [], merchant: [] };
  const mentorTotal = sum(shown.direct);
  const merchantTotal = sum(shown.merchant);
  const total = mentorTotal + merchantTotal;
  const label = new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const change = data && before !== null ? (before > 0 ? Math.round(((total - before) / before) * 100) : total > 0 ? 100 : 0) : null;

  return (
    <div className="space-y-3 px-3 py-3">
      <DateBar day={day} setDay={setDay} gold />
      {error && <p className="text-xs text-[#E5484D]">⚠ Could not load: {error}</p>}

      <div className="flex gap-2">
        <div className="min-w-0 flex-[1.3] rounded-[20px] bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] p-4 text-white shadow-lg">
          <p className="text-[11px] font-bold">Earned · {label}</p>
          <p className="truncate text-[28px] font-black leading-tight">{amount(total)}</p>
          <p className="text-[11px] font-bold">
            {change === null ? "\u00a0" : change === 0 ? "= same as the day before" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% vs the day before`}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex-1 rounded-2xl bg-white shadow-sm px-3 py-2">
            <p className="text-[10px] text-[#5B6B8C]">★ My Tags · 3%</p>
            <p className="truncate font-black text-[#1E63D6]">{amount(mentorTotal)}</p>
          </div>
          <div className="flex-1 rounded-2xl bg-white shadow-sm px-3 py-2">
            <p className="text-[10px] text-[#5B6B8C]">◆ Merchants · 0.5%</p>
            <p className="truncate font-black text-[#8B5CFF]">{amount(merchantTotal)}</p>
          </div>
        </div>
      </div>

      <TagGrid title="Mentor Tag" icon="★" rows={shown.direct} total={mentorTotal} tone="main" ready={!!data} empty="No mentor tagged users yet" />
      <TagGrid title="Merchant Tag" icon="◆" rows={shown.merchant} total={merchantTotal} tone="second" ready={!!data} empty="No merchant tagged users yet" />
    </div>
  );
}

const sum = (rows: Row[]) => rows.reduce((a, r) => a + r.earning, 0);
const sumAll = (r: { direct: Row[]; merchant: Row[] }) => sum(r.direct) + sum(r.merchant);
const dayBefore = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
};

/** One day's report (kept in memory for the next visit). */
async function loadReport(me: string, day: string) {
  const r = await trailReport("mentor", day, async () => {
    const t = await trailForDay(me, day);
    return { direct: t.direct, merchantSourced: t.merchant, total: 0 };
  });
  const out = { direct: r.direct || [], merchant: r.merchantSourced || [] };
  reportMemory.set(`${me}|${day}`, out);
  return out;
}

/** A card per tagged user: the ones who spent that day glow (most first),
 *  the rest are dimmed. */
function TagGrid(p: { title: string; icon: string; rows: Row[]; total: number; tone: "main" | "second"; ready: boolean; empty: string }) {
  // theme colours (classes, so the colour theme recolours them)
  const ink = p.tone === "main" ? "text-[#1E63D6]" : "text-[#8B5CFF]";
  const ring = p.tone === "main" ? "border-[#1E63D6]" : "border-[#8B5CFF]";
  const rows = [...p.rows].sort((a, b) => b.earning - a.earning || b.spend - a.spend || a.username.localeCompare(b.username));
  const active = rows.filter((r) => r.spend > 0).length;
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2 pt-1">
        <p className="text-sm font-black text-[#0B2A5B]">
          <span className={ink}>{p.icon}</span> {p.title} · {p.rows.length}
        </p>
        <p className="text-[11px] text-[#5B6B8C]">
          {p.rows.length > 0 && `${active} active · `}
          <b className={ink}>🪙 {amount(p.total)}</b>
        </p>
      </div>
      {rows.length === 0 ? (
        p.ready ? (
          <p className="rounded-2xl bg-white shadow-sm py-5 text-center text-xs text-[#5B6B8C]">
            <span className="block text-xl">👥</span>
            {p.empty}
          </p>
        ) : (
          // still filling in: a quiet blank, not "nobody yet"
          <div className="h-24 rounded-2xl bg-white/70" />
        )
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {rows.map((r) => {
            const on = r.spend > 0;
            return (
              <li
                key={r.username}
                className={`flex min-w-0 flex-col items-center rounded-2xl bg-white shadow-sm px-1.5 py-2.5 text-center ${on ? `border-[1.5px] shadow-md ${ring}` : "opacity-50"}`}
              >
                <Avatar name={r.username} size="h-9 w-9" />
                <span data-notranslate className="mt-1 w-full truncate text-[13px] font-bold text-[#0B2A5B]">@{r.username}</span>
                <span className="w-full truncate text-[10px] text-[#5B6B8C]">{amount(r.spend)} spent</span>
                <span className={`mt-0.5 w-full truncate text-[15px] font-black ${on ? "text-[#16A34A]" : "text-[#A3AFC2]"}`}>+{amount(r.earning)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
